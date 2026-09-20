import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RING_COLOR: Record<string, string> = {
  HEALTHY: "#22C55E",
  WARNING: "#F5B429",
  CRITICAL: "#EF4444",
  UNKNOWN: "#8CA0BE",
};

export function HealthScoreCard({ score, status, lastCheckedAt }: { score: number; status: string; lastCheckedAt?: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = RING_COLOR[status] ?? RING_COLOR.UNKNOWN;

  return (
    <div className="flex items-center gap-6 rounded-lg border border-paper-border bg-ink px-6 py-6 text-white">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#22314A" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="data-mono text-3xl font-semibold">{score}</span>
          <span className="text-xs text-ink-muted">/ 100</span>
        </div>
      </div>
      <div>
        <Badge status={status}>{status}</Badge>
        <p className={cn("mt-2 text-sm text-ink-muted")}>
          {lastCheckedAt ? `Last checked ${new Date(lastCheckedAt).toLocaleString()}` : "No checks run yet"}
        </p>
      </div>
    </div>
  );
}
