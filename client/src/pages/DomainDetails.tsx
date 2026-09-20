import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { RefreshCw, Trash2, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { HealthScoreCard } from "@/components/domain/HealthScoreCard";
import { CheckList } from "@/components/domain/CheckList";
import { IssueList } from "@/components/domain/IssueList";
import { HistoryChart } from "@/components/domain/HistoryChart";
import { useDomain, useDomainIssues, useDomainHistory, useTriggerCheck, useDeleteDomain } from "@/hooks/useDomains";
import { ApiError } from "@/lib/api";

export function DomainDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useDomain(id);
  const { data: issuesData } = useDomainIssues(id);
  const { data: historyData } = useDomainHistory(id);
  const triggerCheck = useTriggerCheck(id!);
  const deleteDomain = useDeleteDomain();
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading domain…" />;
  if (isError || !data) return <ErrorState message="Couldn't load this domain." onRetry={() => refetch()} />;

  const { domain, latestCheck } = data;

  const handleTriggerCheck = async () => {
    setRateLimitMessage(null);
    try {
      await triggerCheck.mutateAsync();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setRateLimitMessage("You're running checks too frequently. Please wait a minute and try again.");
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Stop monitoring ${domain.hostname}? This cannot be undone.`)) return;
    await deleteDomain.mutateAsync(domain.id);
    navigate("/dashboard");
  };

  return (
    <div>
      <Link to="/dashboard" className="flex items-center gap-1 text-sm text-paper-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to domains
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="data-mono text-xl font-semibold text-ink">{domain.hostname}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/domains/${domain.id}/monitoring`)}>
            <Settings className="h-4 w-4" /> Monitoring
          </Button>
          <Button size="sm" onClick={handleTriggerCheck} disabled={triggerCheck.isPending}>
            <RefreshCw className={`h-4 w-4 ${triggerCheck.isPending ? "animate-spin" : ""}`} />
            {triggerCheck.isPending ? "Queuing…" : "Run check now"}
          </Button>
          <Button variant="destructive" size="sm" aria-label={`Delete ${domain.hostname}`} onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {rateLimitMessage && <p className="mt-2 text-sm text-critical">{rateLimitMessage}</p>}
      {triggerCheck.isSuccess && !rateLimitMessage && (
        <p className="mt-2 text-sm text-paper-muted">Check queued — results will appear here shortly.</p>
      )}

      <div className="mt-5">
        {latestCheck ? (
          <HealthScoreCard score={latestCheck.healthScore} status={latestCheck.status} lastCheckedAt={latestCheck.createdAt} />
        ) : (
          <HealthScoreCard score={0} status="UNKNOWN" />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Check results</CardTitle>
          </CardHeader>
          <CardContent>
            {latestCheck ? <CheckList check={latestCheck} /> : <p className="text-sm text-paper-muted">No checks have run yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detected issues</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueList issues={issuesData?.issues ?? []} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Health score history</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryChart history={historyData?.history ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
