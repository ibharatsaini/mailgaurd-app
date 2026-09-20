import { Badge } from "@/components/ui/badge";
import type { DomainCheck } from "@/hooks/useDomains";

const CHECK_LABELS: Array<{ key: keyof DomainCheck; label: string }> = [
  { key: "dnsResult", label: "DNS" },
  { key: "mxResult", label: "MX" },
  { key: "spfResult", label: "SPF" },
  { key: "dkimResult", label: "DKIM" },
  { key: "dmarcResult", label: "DMARC" },
  { key: "httpResult", label: "HTTP" },
  { key: "tlsResult", label: "TLS" },
];

export function CheckList({ check }: { check: DomainCheck }) {
  return (
    <ul className="divide-y divide-paper-border">
      {CHECK_LABELS.map(({ key, label }) => {
        const result = check[key] as any;
        return (
          <li key={key} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-ink">{label}</p>
              <p className="mt-0.5 text-sm text-paper-muted">{result.summary}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="data-mono text-xs text-paper-muted">{result.latencyMs}ms</span>
              <Badge status={result.status}>{result.status}</Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
