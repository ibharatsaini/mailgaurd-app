import type { CheckResult, CheckStatus } from "./dns.service";

/**
 * Health score design:
 *
 * Rather than an opaque "vibes" number, the score is a weighted sum of six
 * checks, each contributing points based on its status. Weights reflect
 * real-world deliverability impact — e.g. a broken MX record means mail
 * literally cannot arrive (heavily weighted), while a DKIM warning is a
 * best-practice nudge (lightly weighted). This is shown to the user
 * alongside the score so the number is never a black box.
 */

export interface WeightedCheck {
  key: "dns" | "mx" | "spf" | "dkim" | "dmarc" | "http" | "tls";
  label: string;
  weight: number; // out of 100, all weights sum to 100
  result: CheckResult<any>;
}

const WEIGHTS: Record<WeightedCheck["key"], number> = {
  mx: 25, // no MX = mail cannot be delivered at all
  spf: 15,
  dmarc: 15,
  dkim: 10,
  dns: 10,
  http: 15,
  tls: 10,
};

const STATUS_MULTIPLIER: Record<CheckStatus, number> = {
  PASS: 1,
  WARN: 0.5,
  FAIL: 0,
  ERROR: 0.25, // couldn't verify — not the domain's fault, but not a clean pass either
};

export interface HealthScoreResult {
  score: number; // 0-100
  status: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
  breakdown: Array<{ key: string; label: string; weight: number; earned: number; status: CheckStatus; summary: string }>;
}

export function computeHealthScore(checks: Record<WeightedCheck["key"], CheckResult<any>>): HealthScoreResult {
  const labels: Record<WeightedCheck["key"], string> = {
    dns: "DNS Resolution",
    mx: "MX Records",
    spf: "SPF",
    dkim: "DKIM",
    dmarc: "DMARC",
    http: "HTTP Availability",
    tls: "TLS Certificate",
  };

  let exactTotal = 0;
  const breakdown: HealthScoreResult["breakdown"] = [];

  for (const key of Object.keys(WEIGHTS) as WeightedCheck["key"][]) {
    const weight = WEIGHTS[key];
    const result = checks[key];
    const exactEarned = weight * STATUS_MULTIPLIER[result.status];
    exactTotal += exactEarned;
    // Rounded only for per-check display; the overall score is rounded once
    // from the exact total below so seven independent roundings can't drift
    // the sum away from what the individual badges appear to add up to.
    breakdown.push({ key, label: labels[key], weight, earned: Math.round(exactEarned), status: result.status, summary: result.summary });
  }

  const score = Math.max(0, Math.min(100, Math.round(exactTotal)));
  const status: HealthScoreResult["status"] =
    score >= 90 ? "HEALTHY" : score >= 60 ? "WARNING" : "CRITICAL";

  return { score, status, breakdown };
}
