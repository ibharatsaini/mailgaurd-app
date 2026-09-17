import * as React from "react";
import { cn } from "@/lib/utils";

const badgeStyles: Record<string, string> = {
  HEALTHY: "bg-healthy/10 text-healthy border-healthy/30",
  PASS: "bg-healthy/10 text-healthy border-healthy/30",
  WARNING: "bg-warning/10 text-warning border-warning/30",
  WARN: "bg-warning/10 text-warning border-warning/30",
  CRITICAL: "bg-critical/10 text-critical border-critical/30",
  FAIL: "bg-critical/10 text-critical border-critical/30",
  ERROR: "bg-critical/10 text-critical border-critical/30",
  UNKNOWN: "bg-paper-muted/10 text-paper-muted border-paper-border",
  INFO: "bg-signal/10 text-signal border-signal/30",
};

export function Badge({ status, children, className }: { status: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeStyles[status] ?? badgeStyles.UNKNOWN,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
