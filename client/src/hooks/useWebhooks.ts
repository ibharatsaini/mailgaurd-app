import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "EXHAUSTED";
  attempts: number;
  responseCode: number | null;
  errorMessage: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<{ webhooks: Webhook[] }>("/api/v1/webhooks"),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events: string[] }) => api.post<{ webhook: Webhook; secret: string }>("/api/v1/webhooks", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/v1/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useWebhookDeliveries(id: string | undefined) {
  return useQuery({
    queryKey: ["webhooks", id, "deliveries"],
    queryFn: () => api.get<{ deliveries: WebhookDelivery[] }>(`/api/v1/webhooks/${id}/deliveries`),
    enabled: !!id,
  });
}
