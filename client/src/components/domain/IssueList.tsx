import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { DomainIssue } from "@/hooks/useDomains";
import { formatRelativeTime } from "@/lib/utils";

const SEVERITY_ICON: Record<string, React.ElementType> = {
  CRITICAL: AlertCircle,
  WARNING: AlertTriangle,
  INFO: Info,
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "text-critical",
  WARNING: "text-warning",
  INFO: "text-signal",
};

export function IssueList({ issues }: { issues: DomainIssue[] }) {
  if (issues.length === 0) {
    return <p className="py-6 text-center text-sm text-paper-muted">No issues detected. Everything looks good.</p>;
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue) => {
        const Icon = SEVERITY_ICON[issue.severity] ?? Info;
        return (
          <li key={issue.id} className="flex items-start gap-3 rounded-md border border-paper-border p-3">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_COLOR[issue.severity]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{issue.message}</p>
              <p className="mt-1 text-xs text-paper-muted">
                {issue.type.replace(/_/g, " ").toLowerCase()} · {formatRelativeTime(issue.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
