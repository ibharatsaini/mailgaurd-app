import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { checkDns, checkMx, checkSpf, checkDkim, checkDmarc, CheckResult } from "./dns.service";
import { checkHttp } from "./http.service";
import { checkTls } from "./tls.service";
import { computeHealthScore } from "./healthScore.service";
import { logger } from "../config/logger";
import type { IssueSeverity, IssueType, Prisma } from "../generated/prisma/client";
import { enqueueWebhookEvent } from "./webhook.service";
import { reconcileIssues, snapshotConfig, diffConfig, type DerivedIssue } from "./issueLifecycle";

interface DeriveIssueRule {
  type: IssueType;
  severity: IssueSeverity;
  test: (r: CheckResult<any>) => boolean;
  message: (r: CheckResult<any>) => string;
}

const ISSUE_RULES: Record<string, DeriveIssueRule[]> = {
  mx: [{ type: "MX_MISSING", severity: "CRITICAL", test: (r) => r.status === "FAIL", message: (r) => r.summary }],
  spf: [
    { type: "SPF_MISSING", severity: "CRITICAL", test: (r) => r.status === "FAIL" && r.summary.includes("No SPF"), message: (r) => r.summary },
    { type: "SPF_MULTIPLE", severity: "CRITICAL", test: (r) => r.summary.includes("Multiple SPF"), message: (r) => r.summary },
    { type: "SPF_TOO_MANY_LOOKUPS", severity: "CRITICAL", test: (r) => r.summary.includes("maximum of 10"), message: (r) => r.summary },
    { type: "SPF_SYNTAX_ERROR", severity: "WARNING", test: (r) => r.status === "WARN", message: (r) => r.summary },
  ],
  dkim: [{ type: "DKIM_NOT_FOUND", severity: "WARNING", test: (r) => r.status === "WARN" || r.status === "FAIL", message: (r) => r.summary }],
  dmarc: [
    { type: "DMARC_MISSING", severity: "CRITICAL", test: (r) => r.status === "FAIL", message: (r) => r.summary },
    { type: "DMARC_POLICY_NONE", severity: "WARNING", test: (r) => r.summary.includes("p=none") || r.summary.includes("monitor-only"), message: (r) => r.summary },
  ],
  dns: [{ type: "DNS_RESOLUTION_FAILED", severity: "CRITICAL", test: (r) => r.status === "FAIL", message: (r) => r.summary }],
  http: [
    { type: "HTTP_UNREACHABLE", severity: "WARNING", test: (r) => r.status === "ERROR", message: (r) => r.summary },
    { type: "HTTP_ERROR_STATUS", severity: "WARNING", test: (r) => r.status === "FAIL" || r.status === "WARN", message: (r) => r.summary },
  ],
  tls: [
    { type: "TLS_EXPIRED", severity: "CRITICAL", test: (r) => r.summary.includes("expired"), message: (r) => r.summary },
    { type: "TLS_EXPIRING_SOON", severity: "WARNING", test: (r) => r.summary.includes("expires in") && r.status === "WARN", message: (r) => r.summary },
    { type: "TLS_INVALID", severity: "CRITICAL", test: (r) => r.summary.includes("not trusted"), message: (r) => r.summary },
    { type: "TLS_UNREACHABLE", severity: "WARNING", test: (r) => r.status === "ERROR", message: (r) => r.summary },
  ],
};

function deriveIssues(checks: Record<string, CheckResult<any>>): DerivedIssue[] {
  const issues: DerivedIssue[] = [];
  for (const [key, rules] of Object.entries(ISSUE_RULES)) {
    const result = checks[key];
    if (!result) continue;
    let matched = false;
    for (const rule of rules) {
      if (rule.test(result)) {
        issues.push({ type: rule.type, severity: rule.severity, message: rule.message(result), detail: result.details });
        matched = true;
        break; // one issue per check per run keeps the issue list readable
      }
    }
    // A check that could not be completed (resolver timeout, network error) lowers the score
    // but matches none of the specific rules above; surface it instead of hiding it.
    if (!matched && result.status === "ERROR") {
      issues.push({
        type: /timed out/i.test(result.summary) ? "CHECK_TIMEOUT" : "CHECK_ERROR",
        severity: "WARNING",
        message: result.summary,
        detail: { check: key, ...(result.details ?? {}) },
      });
    }
  }
  return issues;
}

export async function runDomainCheck(domainId: string, triggeredBy: "manual" | "scheduled" | "api") {
  console.log(`Inside domain check `)
  const domain = await prisma.domain.findUniqueOrThrow({ where: { id: domainId } });
  console.log(`Inside domain check domid`,domain.id)

  const start = Date.now();

  logger.info({ domainId, hostname: domain.hostname, triggeredBy }, "Starting domain check");

  const [dnsResult, mxResult, spfResult, dkimResult, dmarcResult, httpResult, tlsResult] = await Promise.all([
    checkDns(domain.hostname, env.CHECK_TIMEOUT_MS),
    checkMx(domain.hostname, env.CHECK_TIMEOUT_MS),
    checkSpf(domain.hostname, env.CHECK_TIMEOUT_MS),
    checkDkim(domain.hostname, domain.dkimSelectors, env.CHECK_TIMEOUT_MS),
    checkDmarc(domain.hostname, env.CHECK_TIMEOUT_MS),
    checkHttp(domain.hostname, env.CHECK_TIMEOUT_MS),
    checkTls(domain.hostname, env.CHECK_TIMEOUT_MS),
  ]);

  const checks = { dns: dnsResult, mx: mxResult, spf: spfResult, dkim: dkimResult, dmarc: dmarcResult, http: httpResult, tls: tlsResult };
  const { score, status, breakdown } = computeHealthScore(checks);
  const issuesToCreate = deriveIssues(checks);
  const durationMs = Date.now() - start;

  const currentConfig = snapshotConfig({ mx: mxResult, spf: spfResult, dkim: dkimResult, dmarc: dmarcResult });

  const { domainCheck, newIssues, configChanges } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const previous = await tx.domainCheck.findFirst({ where: { domainId }, orderBy: { createdAt: "desc" } });
    const configChanges = previous
      ? diffConfig(
          snapshotConfig({ mx: previous.mxResult as any, spf: previous.spfResult as any, dkim: previous.dkimResult as any, dmarc: previous.dmarcResult as any }),
          currentConfig,
        )
      : [];

    const created = await tx.domainCheck.create({
      data: {
        domainId,
        status,
        healthScore: score,
        triggeredBy,
        dnsResult: dnsResult as any,
        mxResult: mxResult as any,
        spfResult: spfResult as any,
        dkimResult: dkimResult as any,
        dmarcResult: dmarcResult as any,
        httpResult: httpResult as any,
        tlsResult: tlsResult as any,
        durationMs,
      },
    });

    // Issue lifecycle: keep one open row per problem, refresh it while it persists, and
    // mark it resolved once a later check no longer finds it.
    const open = await tx.domainIssue.findMany({ where: { domainId, resolvedAt: null }, orderBy: { createdAt: "asc" } });
    const { create, update, resolveIds } = reconcileIssues(open, issuesToCreate);

    if (resolveIds.length > 0) {
      await tx.domainIssue.updateMany({ where: { id: { in: resolveIds } }, data: { resolvedAt: new Date() } });
    }
    for (const { id, issue } of update) {
      await tx.domainIssue.update({ where: { id }, data: { message: issue.message, severity: issue.severity, detail: issue.detail as any } });
    }
    if (create.length > 0) {
      await tx.domainIssue.createMany({
        data: create.map((i) => ({
          domainId,
          domainCheckId: created.id,
          type: i.type,
          severity: i.severity,
          message: i.message,
          detail: i.detail as any,
        })),
      });
    }

    await tx.monitoringConfig.updateMany({
      where: { domainId },
      data: { lastRunAt: new Date() },
    });

    return { domainCheck: created, newIssues: create, configChanges };
  });

  logger.info({ domainId, hostname: domain.hostname, score, status, durationMs }, "Domain check completed");

  await enqueueWebhookEvent(domain.userId, "DOMAIN_CHECK_COMPLETED", {
    domainId,
    hostname: domain.hostname,
    healthScore: score,
    status,
    checkId: domainCheck.id,
  });

  // Only problems that are new since the previous check notify; a persisting issue would
  // otherwise re-fire the webhook on every scheduled run.
  const newCritical = newIssues.filter((i) => i.severity === "CRITICAL");
  if (newCritical.length > 0) {
    await enqueueWebhookEvent(domain.userId, "DOMAIN_ISSUE_DETECTED", {
      domainId,
      hostname: domain.hostname,
      issues: newCritical,
    });
  }

  if (configChanges.length > 0) {
    await enqueueWebhookEvent(domain.userId, "DOMAIN_CONFIGURATION_CHANGED", {
      domainId,
      hostname: domain.hostname,
      checkId: domainCheck.id,
      changes: configChanges,
    });
  }

  return { domainCheck, breakdown };
}
