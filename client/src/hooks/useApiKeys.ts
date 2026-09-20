import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ["apiKeys"],
    queryFn: () => api.get<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[]; expiresInDays?: number }) =>
      api.post<{ apiKey: ApiKey; plaintextKey: string }>("/api/v1/api-keys", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apiKeys"] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ apiKey: ApiKey }>(`/api/v1/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apiKeys"] }),
  });
}
