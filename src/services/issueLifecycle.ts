import type { IssueSeverity, IssueType } from "../generated/prisma/client";
import type { CheckResult } from "./dns.service";

/**
 * Pure helpers for what happens to issues and configuration between two checks of the
 * same domain. Kept free of I/O so the rules can be unit-tested without a database.
 */

export interface DerivedIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  detail: unknown;
}

export interface OpenIssue {
  id: string;
  type: IssueType;
  detail: unknown;
}

// CHECK_TIMEOUT / CHECK_ERROR can occur for several checks at once (e.g. SPF *and* DKIM
// timing out), so the check name is part of their identity; every other type maps 1:1 to
// a single check.
function issueKey(type: IssueType, detail: unknown): string {
  if (type === "CHECK_TIMEOUT" || type === "CHECK_ERROR") {
    return `${type}:${(detail as { check?: string } | null)?.check ?? ""}`;
  }
  return type;
}

/**
 * Decides how this run's findings change the domain's issue list:
 *  - a problem that is already open is *updated* (fresh message/detail), not duplicated;
 *  - a new problem is *created* (and is the only kind that should notify webhooks);
 *  - an open problem that no longer shows up is *resolved*.
 * `open` must be ordered oldest-first so the original "first detected" row is the one kept.
 */
export function reconcileIssues(open: OpenIssue[], derived: DerivedIssue[]) {
  const openByKey = new Map<string, OpenIssue>();
  const duplicates: OpenIssue[] = [];
  for (const issue of open) {
    const key = issueKey(issue.type, issue.detail);
    if (openByKey.has(key)) duplicates.push(issue);
    else openByKey.set(key, issue);
  }

  const seen = new Set<string>();
  const create: DerivedIssue[] = [];
  const update: Array<{ id: string; issue: DerivedIssue }> = [];
  for (const issue of derived) {
    const key = issueKey(issue.type, issue.detail);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = openByKey.get(key);
    if (existing) update.push({ id: existing.id, issue });
    else create.push(issue);
  }

  const resolveIds = [
    ...duplicates.map((i) => i.id),
    ...[...openByKey.entries()].filter(([key]) => !seen.has(key)).map(([, i]) => i.id),
  ];
  return { create, update, resolveIds };
}

// ---------------------------------------------------------------------------
// Configuration change detection
// ---------------------------------------------------------------------------

export type ConfigField = "mx" | "spf" | "dkim" | "dmarc";
/** `undefined` means "couldn't be determined this run" (timeout / resolver error). */
export type ConfigSnapshot = Partial<Record<ConfigField, string>>;

export interface ConfigChange {
  field: ConfigField;
  from: string;
  to: string;
}

type Results = Partial<Record<ConfigField, CheckResult<any> | null | undefined>>;

export function snapshotConfig(results: Results): ConfigSnapshot {
  const snap: ConfigSnapshot = {};

  const mx = results.mx;
  if (mx && !mx.details?.error) {
    const records: Array<{ exchange?: string; priority?: number }> = mx.details?.records ?? [];
    snap.mx = records
      .map((r) => `${r.priority} ${String(r.exchange ?? "").toLowerCase()}`)
      .sort()
      .join(" | ");
  }

  const spf = results.spf;
  if (spf && spf.status !== "ERROR") snap.spf = spf.details?.raw ?? "";

  const dmarc = results.dmarc;
  if (dmarc && dmarc.status !== "ERROR") snap.dmarc = dmarc.details?.raw ?? "";

  const dkim = results.dkim;
  if (dkim && dkim.status !== "ERROR") {
    const found: Array<{ selector: string; found: boolean }> = dkim.details?.found ?? [];
    snap.dkim = found
      .filter((f) => f.found)
      .map((f) => f.selector)
      .sort()
      .join(", ");
  }
  return snap;
}

/** Only fields that could be read on *both* runs are compared, so a timeout never looks like a change. */
export function diffConfig(previous: ConfigSnapshot, current: ConfigSnapshot): ConfigChange[] {
  const changes: ConfigChange[] = [];
  for (const field of ["mx", "spf", "dkim", "dmarc"] as ConfigField[]) {
    const from = previous[field];
    const to = current[field];
    if (from !== undefined && to !== undefined && from !== to) changes.push({ field, from, to });
  }
  return changes;
}
