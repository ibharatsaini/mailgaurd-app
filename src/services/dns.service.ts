import dns from "node:dns/promises";
import { logger } from "../config/logger";

export type CheckStatus = "PASS" | "WARN" | "FAIL" | "ERROR";

export interface CheckResult<T = Record<string, unknown>> {
  status: CheckStatus;
  latencyMs: number;
  summary: string;
  details: T;
}

// Selectors that cover the overwhelming majority of real-world DKIM setups
// (Google Workspace, Microsoft 365, SendGrid, Mailchimp, generic defaults).
export const COMMON_DKIM_SELECTORS = [
  "google",
  "selector1",
  "selector2",
  "default",
  "k1",
  "s1",
  "mandrill",
  "mailjet",
  "mailgun",
  "sendgrid",
];

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Node reports "this name has no record of that type" (ENODATA) and "this name doesn't exist"
// (ENOTFOUND) as errors. For TXT/MX lookups that is a valid, *expected* answer, meaning the
// domain has no SPF/DMARC/MX record, and must not be confused with a resolver failure.
function isNoRecord(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENODATA" || code === "ENOTFOUND";
}

function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, latencyMs: Date.now() - start }));
}

// ---------- DNS / MX ----------

export async function checkDns(hostname: string, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { result, latencyMs } = await timed(() =>
      withTimeout(dns.resolve4(hostname).catch(() => dns.resolve6(hostname)), timeoutMs, "DNS resolution"),
    );
    return {
      status: "PASS",
      latencyMs,
      summary: `Resolved to ${result.length} address${result.length === 1 ? "" : "es"}`,
      details: { addresses: result },
    };
  } catch (err) {
    return {
      status: "FAIL",
      latencyMs: Date.now() - start,
      summary: `DNS resolution failed: ${(err as Error).message}`,
      details: { error: (err as Error).message },
    };
  }
}

export async function checkMx(hostname: string, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  try {
    const { result, latencyMs } = await timed(() => withTimeout(dns.resolveMx(hostname), timeoutMs, "MX lookup"));
    if (result.length === 0) {
      return {
        status: "FAIL",
        latencyMs,
        summary: "No MX records found — mail cannot be delivered to this domain",
        details: { records: [] },
      };
    }
    const sorted = [...result].sort((a, b) => a.priority - b.priority);
    return {
      status: "PASS",
      latencyMs,
      summary: `${result.length} MX record${result.length === 1 ? "" : "s"} found`,
      details: { records: sorted },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (isNoRecord(err)) {
      return { status: "FAIL", latencyMs, summary: "No MX records found — mail cannot be delivered to this domain", details: { records: [] } };
    }
    return { status: "ERROR", latencyMs, summary: `MX lookup failed: ${(err as Error).message}`, details: { error: (err as Error).message } };
  }
}

// ---------- SPF ----------

interface SpfParseResult {
  found: boolean;
  raw?: string;
  mechanisms: string[];
  lookupCount: number;
  qualifier?: string; // ~all, -all, +all, ?all
  issues: string[];
}

// SPF allows at most 10 DNS-querying mechanisms (include/a/mx/ptr/exists/redirect)
// per RFC 7208 §4.6.4. Exceeding it causes SPF to permanently fail (permerror).
const SPF_LOOKUP_MECHANISMS = ["include:", "a:", "a ", "mx:", "mx ", "ptr:", "ptr ", "exists:", "redirect="];

function parseSpfRecord(raw: string): SpfParseResult {
  const mechanisms = raw.split(/\s+/).filter(Boolean);
  const lookupCount = mechanisms.filter((m) => SPF_LOOKUP_MECHANISMS.some((prefix) => m.startsWith(prefix))).length;
  const allMechanism = mechanisms.find((m) => /^[~\-+?]?all$/i.test(m));
  const issues: string[] = [];

  if (!raw.toLowerCase().startsWith("v=spf1")) {
    issues.push("Record does not start with 'v=spf1'");
  }
  if (lookupCount > 10) {
    issues.push(`SPF has ${lookupCount} DNS-querying mechanisms; RFC 7208 permits a maximum of 10`);
  }
  if (!allMechanism) {
    issues.push("No 'all' mechanism found — SPF result is undefined for non-matching senders");
  } else if (allMechanism.startsWith("+")) {
    issues.push("SPF uses '+all', which permits ANY server to send mail as this domain (misconfiguration)");
  }

  return {
    found: true,
    raw,
    mechanisms,
    lookupCount,
    qualifier: allMechanism,
    issues,
  };
}

export async function checkSpf(hostname: string, timeoutMs: number): Promise<CheckResult<SpfParseResult>> {
  const start = Date.now();
  try {
    const { result: txtRecords, latencyMs } = await timed(() =>
      withTimeout(dns.resolveTxt(hostname), timeoutMs, "SPF TXT lookup"),
    );
    const flattened = txtRecords.map((chunks) => chunks.join(""));
    const spfRecords = flattened.filter((r) => r.toLowerCase().startsWith("v=spf1"));

    if (spfRecords.length === 0) {
      return {
        status: "FAIL",
        latencyMs,
        summary: "No SPF record found",
        details: { found: false, mechanisms: [], lookupCount: 0, issues: ["No v=spf1 TXT record present"] },
      };
    }
    if (spfRecords.length > 1) {
      return {
        status: "FAIL",
        latencyMs,
        summary: `Multiple SPF records found (${spfRecords.length}) — RFC 7208 requires exactly one`,
        details: { found: true, mechanisms: [], lookupCount: 0, issues: ["Multiple v=spf1 records present"], raw: spfRecords.join(" | ") },
      };
    }

    const parsed = parseSpfRecord(spfRecords[0]);
    const status: CheckStatus = parsed.issues.length === 0 ? "PASS" : parsed.issues.some((i) => i.includes("permits ANY") || i.includes("maximum of 10")) ? "FAIL" : "WARN";

    return {
      status,
      latencyMs,
      summary: status === "PASS" ? "Valid SPF record found" : parsed.issues[0],
      details: parsed,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (isNoRecord(err)) {
      return {
        status: "FAIL",
        latencyMs,
        summary: "No SPF record found",
        details: { found: false, mechanisms: [], lookupCount: 0, issues: ["No v=spf1 TXT record present"] },
      };
    }
    return {
      status: "ERROR",
      latencyMs,
      summary: `SPF lookup failed: ${(err as Error).message}`,
      details: { found: false, mechanisms: [], lookupCount: 0, issues: [(err as Error).message] },
    };
  }
}

// ---------- DKIM ----------

interface DkimSelectorResult {
  selector: string;
  found: boolean;
  raw?: string;
  keyType?: string;
  issues: string[];
}

interface DkimParseResult {
  selectorsChecked: string[];
  found: DkimSelectorResult[];
}

function parseDkimTxt(raw: string): { keyType?: string; issues: string[] } {
  const issues: string[] = [];
  const tags = Object.fromEntries(
    raw
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const idx = t.indexOf("=");
        return [t.slice(0, idx).trim().toLowerCase(), t.slice(idx + 1).trim()];
      }),
  );

  if (!tags["p"]) {
    issues.push("Missing public key ('p=') tag — key may have been revoked");
  } else if (tags["p"].length < 200) {
    // Rough heuristic: a base64 RSA-1024 key is short; RSA-2048+ is
    // considerably longer. This flags obviously weak/legacy keys.
    issues.push("Public key appears short — consider rotating to a 2048-bit RSA key");
  }

  return { keyType: tags["k"] || "rsa", issues };
}

export async function checkDkim(
  hostname: string,
  customSelectors: string[],
  timeoutMs: number,
): Promise<CheckResult<DkimParseResult>> {
  const start = Date.now();
  const selectorsToTry = Array.from(new Set([...customSelectors, ...COMMON_DKIM_SELECTORS]));

  const results = await Promise.all(
    selectorsToTry.map(async (selector): Promise<DkimSelectorResult> => {
      const domain = `${selector}._domainkey.${hostname}`;
      try {
        const records = await withTimeout(dns.resolveTxt(domain), timeoutMs, `DKIM ${selector}`);
        const raw = records.map((c) => c.join("")).join("");
        if (!raw.toLowerCase().includes("v=dkim1") && !raw.includes("p=")) {
          return { selector, found: false, issues: [] };
        }
        const { keyType, issues } = parseDkimTxt(raw);
        return { selector, found: true, raw, keyType, issues };
      } catch {
        return { selector, found: false, issues: [] };
      }
    }),
  );

  const latencyMs = Date.now() - start;
  const found = results.filter((r) => r.found);

  if (found.length === 0) {
    return {
      status: "WARN",
      latencyMs,
      summary: `No DKIM record found across ${selectorsToTry.length} selector(s) tried`,
      details: { selectorsChecked: selectorsToTry, found: [] },
    };
  }

  const withIssues = found.filter((f) => f.issues.length > 0);
  return {
    status: withIssues.length > 0 ? "WARN" : "PASS",
    latencyMs,
    summary:
      withIssues.length > 0
        ? `DKIM found but flagged: ${withIssues[0].issues[0]}`
        : `Valid DKIM record found (selector: ${found[0].selector})`,
    details: { selectorsChecked: selectorsToTry, found },
  };
}

// ---------- DMARC ----------

interface DmarcParseResult {
  found: boolean;
  raw?: string;
  policy?: string; // p=
  subdomainPolicy?: string; // sp=
  pct?: number;
  issues: string[];
}

function parseDmarcRecord(raw: string): DmarcParseResult {
  const issues: string[] = [];
  const tags = Object.fromEntries(
    raw
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const idx = t.indexOf("=");
        return [t.slice(0, idx).trim().toLowerCase(), t.slice(idx + 1).trim()];
      }),
  );

  if (!raw.toLowerCase().startsWith("v=dmarc1")) {
    issues.push("Record does not start with 'v=DMARC1'");
  }
  const policy = tags["p"];
  if (!policy) {
    issues.push("Missing required 'p=' policy tag");
  } else if (policy === "none") {
    issues.push("Policy is 'p=none' — DMARC is in monitor-only mode and does not block spoofed mail");
  }

  const pct = tags["pct"] ? parseInt(tags["pct"], 10) : 100;
  if (pct < 100) {
    issues.push(`Policy only applies to ${pct}% of mail ('pct=${pct}')`);
  }

  return { found: true, raw, policy, subdomainPolicy: tags["sp"], pct, issues };
}

export async function checkDmarc(hostname: string, timeoutMs: number): Promise<CheckResult<DmarcParseResult>> {
  const domain = `_dmarc.${hostname}`;
  const start = Date.now();
  try {
    const { result: txtRecords, latencyMs } = await timed(() =>
      withTimeout(dns.resolveTxt(domain), timeoutMs, "DMARC lookup"),
    );
    const flattened = txtRecords.map((c) => c.join(""));
    const dmarcRecords = flattened.filter((r) => r.toLowerCase().startsWith("v=dmarc1"));

    if (dmarcRecords.length === 0) {
      return {
        status: "FAIL",
        latencyMs,
        summary: "No DMARC record found",
        details: { found: false, issues: ["No v=DMARC1 TXT record at _dmarc subdomain"] },
      };
    }

    const parsed = parseDmarcRecord(dmarcRecords[0]);
    const status: CheckStatus = parsed.issues.length === 0 ? "PASS" : parsed.policy === "none" ? "WARN" : parsed.policy ? "WARN" : "FAIL";

    return {
      status,
      latencyMs,
      summary: status === "PASS" ? `DMARC enforced (p=${parsed.policy})` : parsed.issues[0],
      details: parsed,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (isNoRecord(err)) {
      return {
        status: "FAIL",
        latencyMs,
        summary: "No DMARC record found",
        details: { found: false, issues: ["No v=DMARC1 TXT record at _dmarc subdomain"] },
      };
    }
    return {
      status: "ERROR",
      latencyMs,
      summary: `DMARC lookup failed: ${(err as Error).message}`,
      details: { found: false, issues: [(err as Error).message] },
    };
  }
}

export function logDnsError(context: string, hostname: string, err: unknown) {
  logger.warn({ context, hostname, err }, "DNS check encountered an error");
}
