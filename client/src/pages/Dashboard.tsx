import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router";
import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useDomains, useCreateDomain } from "@/hooks/useDomains";
import { ApiError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const schema = z.object({
  hostname: z.string().trim().min(3, "Enter a domain, e.g. example.com"),
});
type FormValues = z.infer<typeof schema>;

// The field takes a bare domain. Be forgiving if someone pastes a full URL:
// "https://Example.com/path" -> "example.com".
function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useDomains();
  const createDomain = useCreateDomain();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await createDomain.mutateAsync({ hostname: normalizeHostname(values.hostname) });
      reset();
      setFocus("hostname");
    } catch (err) {
      if (err instanceof ApiError) {
        setError("hostname", { message: err.message });
      }
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-ink">Domains</h1>
        <p className="mt-1 text-sm text-paper-muted">Everything MailGuard is currently watching.</p>
      </div>

      <Card className="mt-4 p-5">
        <form onSubmit={handleSubmit(onSubmit)} className="flex items-start gap-3" noValidate>
          <div className="flex-1">
            <Input
              aria-label="Domain to check"
              placeholder="Enter a domain to check, e.g. example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              {...register("hostname")}
            />
            {errors.hostname && <p className="mt-1 text-sm text-critical">{errors.hostname.message}</p>}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            <Plus className="h-4 w-4" /> {isSubmitting ? "Adding…" : "Add domain"}
          </Button>
        </form>
      </Card>

      <div className="mt-6">
        {isLoading && <LoadingState label="Loading domains…" />}
        {isError && <ErrorState message="Couldn't load your domains." onRetry={() => refetch()} />}
        {data && data.domains.length === 0 && (
          <EmptyState
            title="No domains yet"
            description="Type a domain above to start monitoring its email health."
          />
        )}
        {data && data.domains.length > 0 && (
          <ul className="space-y-2">
            {data.domains.map((domain) => {
              const latest = domain.checks?.[0];
              return (
                <li key={domain.id}>
                  <Link
                    to={`/domains/${domain.id}`}
                    className="flex items-center justify-between rounded-lg border border-paper-border bg-paper-panel px-5 py-4 transition-colors hover:border-signal"
                  >
                    <div>
                      <p className="data-mono font-medium text-ink">{domain.hostname}</p>
                      <p className="mt-0.5 text-xs text-paper-muted">
                        {domain.monitoringConfig?.enabled ? "Monitoring enabled" : "Monitoring paused"}
                        {domain.monitoringConfig?.lastRunAt && ` · last checked ${formatRelativeTime(domain.monitoringConfig.lastRunAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {latest ? (
                        <>
                          <span className="data-mono text-sm text-paper-muted">{latest.healthScore}/100</span>
                          <Badge status={latest.status}>{latest.status}</Badge>
                        </>
                      ) : (
                        <Badge status="UNKNOWN">Pending first check</Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-paper-muted" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
