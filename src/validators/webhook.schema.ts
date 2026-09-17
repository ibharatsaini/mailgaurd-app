import { z } from "zod";

export const webhookEventEnum = z.enum([
  "DOMAIN_CHECK_COMPLETED",
  "DOMAIN_ISSUE_DETECTED",
  "DOMAIN_CONFIGURATION_CHANGED",
  "DOMAIN_MONITORING_FAILED",
]);

export const createWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://"), "Webhook URLs must use HTTPS"),
  events: z.array(webhookEventEnum).min(1, "At least one event is required"),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
