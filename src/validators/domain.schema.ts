import { z } from "zod";

const HOSTNAME_REGEX =
  /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

export const createDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .regex(HOSTNAME_REGEX, "Must be a valid domain name (e.g. example.com)"),
  dkimSelectors: z
    .array(z.string().trim().min(1).max(63))
    .max(10)
    .optional()
    .default([]),
});

export const monitoringIntervalEnum = z.enum([
  "MIN_15",
  "MIN_30",
  "HOUR_1",
  "HOUR_6",
  "HOUR_12",
  "HOUR_24",
]);

export const updateMonitoringConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval: monitoringIntervalEnum.optional(),
});

export const INTERVAL_TO_MS: Record<
  z.infer<typeof monitoringIntervalEnum>,
  number
> = {
  MIN_15: 15 * 60 * 1000,
  MIN_30: 30 * 60 * 1000,
  HOUR_1: 60 * 60 * 1000,
  HOUR_6: 6 * 60 * 60 * 1000,
  HOUR_12: 12 * 60 * 60 * 1000,
  HOUR_24: 24 * 60 * 60 * 1000,
};

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type UpdateMonitoringConfigInput = z.infer<
  typeof updateMonitoringConfigSchema
>;
