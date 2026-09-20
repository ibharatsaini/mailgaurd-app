import { useParams, Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useDomain, useUpdateMonitoringConfig, type MonitoringConfig } from "@/hooks/useDomains";
import { ApiError } from "@/lib/api";
import { useState } from "react";

const INTERVAL_OPTIONS: Array<{ value: MonitoringConfig["interval"]; label: string }> = [
  { value: "MIN_15", label: "Every 15 minutes" },
  { value: "MIN_30", label: "Every 30 minutes" },
  { value: "HOUR_1", label: "Every hour" },
  { value: "HOUR_6", label: "Every 6 hours" },
  { value: "HOUR_12", label: "Every 12 hours" },
  { value: "HOUR_24", label: "Every 24 hours" },
];

export function MonitoringSettings() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useDomain(id);
  const updateConfig = useUpdateMonitoringConfig(id!);
  const [planError, setPlanError] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading settings…" />;
  if (isError || !data) return <ErrorState message="Couldn't load monitoring settings." onRetry={() => refetch()} />;

  const config = data.domain.monitoringConfig;

  const handleIntervalChange = async (interval: MonitoringConfig["interval"]) => {
    setPlanError(null);
    try {
      await updateConfig.mutateAsync({ interval });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setPlanError(err.message);
      }
    }
  };

  const handleToggleEnabled = async () => {
    await updateConfig.mutateAsync({ enabled: !config?.enabled });
  };

  return (
    <div>
      <Link to={`/domains/${id}`} className="flex items-center gap-1 text-sm text-paper-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to {data.domain.hostname}
      </Link>

      <h1 className="mt-3 text-xl font-semibold text-ink">Monitoring settings</h1>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Scheduled checks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between border-b border-paper-border pb-4">
            <div>
              <p className="text-sm font-medium text-ink">Automatic monitoring</p>
              <p className="mt-0.5 text-sm text-paper-muted">Run all checks on a recurring schedule.</p>
            </div>
            <Button variant={config?.enabled ? "secondary" : "outline"} size="sm" onClick={handleToggleEnabled}>
              {config?.enabled ? "Enabled" : "Paused"}
            </Button>
          </div>

          <div className="pt-4">
            <p className="text-sm font-medium text-ink">Check frequency</p>
            <p className="mt-0.5 text-sm text-paper-muted">Free plans are limited to hourly checks or slower.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleIntervalChange(opt.value)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    config?.interval === opt.value
                      ? "border-signal bg-signal/10 text-signal"
                      : "border-paper-border text-ink hover:border-signal/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {planError && <p className="mt-3 text-sm text-critical">{planError}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
