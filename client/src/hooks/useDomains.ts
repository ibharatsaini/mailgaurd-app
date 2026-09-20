import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CheckResult {
  status: "PASS" | "WARN" | "FAIL" | "ERROR";
  latencyMs: number;
  summary: string;
  details: Record<string, unknown>;
}

export interface MonitoringConfig {
  id: string;
  domainId: string;
  enabled: boolean;
  interval: "MIN_15" | "MIN_30" | "HOUR_1" | "HOUR_6" | "HOUR_12" | "HOUR_24";
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface DomainCheck {
  id: string;
  domainId: string;
  status: "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";
  healthScore: number;
  triggeredBy: string;
  dnsResult: CheckResult;
  mxResult: CheckResult;
  spfResult: CheckResult;
  dkimResult: CheckResult;
  dmarcResult: CheckResult;
  httpResult: CheckResult;
  tlsResult: CheckResult;
  durationMs: number;
  createdAt: string;
}

export interface Domain {
  id: string;
  hostname: string;
  dkimSelectors: string[];
  createdAt: string;
  monitoringConfig: MonitoringConfig | null;
  checks?: DomainCheck[];
}

export interface DomainIssue {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  detail: unknown;
  resolvedAt: string | null;
  createdAt: string;
}

export function useDomains() {
  return useQuery({
    queryKey: ["domains"],
    queryFn: () => api.get<{ domains: Domain[] }>("/api/v1/domains"),
    // Background monitoring changes state without user action, so poll every 30s. While a
    // domain added in the last couple of minutes is still waiting for its first check,
    // poll faster so its result appears without a manual refresh.
    refetchInterval: (query) => {
      const waiting = query.state.data?.domains.some(
        (d) => !d.checks?.length && Date.now() - new Date(d.createdAt).getTime() < 2 * 60_000,
      );
      return waiting ? 3_000 : 30_000;
    },
  });
}

export function useDomain(id: string | undefined) {
  return useQuery({
    queryKey: ["domains", id],
    queryFn: () => api.get<{ domain: Domain; latestCheck: DomainCheck | null }>(`/api/v1/domains/${id}`),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useDomainChecks(id: string | undefined) {
  return useQuery({
    queryKey: ["domains", id, "checks"],
    queryFn: () => api.get<{ checks: DomainCheck[] }>(`/api/v1/domains/${id}/checks`),
    enabled: !!id,
  });
}

export function useDomainIssues(id: string | undefined) {
  return useQuery({
    queryKey: ["domains", id, "issues"],
    queryFn: () => api.get<{ issues: DomainIssue[] }>(`/api/v1/domains/${id}/issues`),
    enabled: !!id,
  });
}

export function useDomainHistory(id: string | undefined) {
  return useQuery({
    queryKey: ["domains", id, "history"],
    queryFn: () => api.get<{ history: Array<{ id: string; healthScore: number; status: string; createdAt: string }> }>(`/api/v1/domains/${id}/history`),
    enabled: !!id,
  });
}

export function useCreateDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { hostname: string; dkimSelectors?: string[] }) => api.post<{ domain: Domain }>("/api/v1/domains", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/v1/domains/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }),
  });
}

export function useTriggerCheck(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ message: string; jobId: string }>(`/api/v1/domains/${id}/check`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains", id] });
      qc.invalidateQueries({ queryKey: ["domains", id, "checks"] });
      qc.invalidateQueries({ queryKey: ["domains", id, "history"] });
    },
  });
}

export function useUpdateMonitoringConfig(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled?: boolean; interval?: MonitoringConfig["interval"] }) =>
      api.patch<{ monitoringConfig: MonitoringConfig }>(`/api/v1/domains/${id}/monitoring`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domains", id] }),
  });
}
