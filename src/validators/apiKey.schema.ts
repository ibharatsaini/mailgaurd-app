import { z } from "zod";

export const apiKeyScopeEnum = z.enum(["DOMAINS_READ", "DOMAINS_WRITE", "CHECKS_TRIGGER", "WEBHOOKS_MANAGE"]);

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  scopes: z.array(apiKeyScopeEnum).min(1, "At least one scope is required").default(["DOMAINS_READ"]),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
