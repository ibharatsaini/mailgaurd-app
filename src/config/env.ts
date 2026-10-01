import dotenv from "dotenv";
import { z } from "zod";

// `quiet` suppresses dotenv's startup banner so it doesn't pollute
dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  SESSION_COOKIE_NAME: z.string().default("mg_session"),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 7),

  CORS_ORIGIN: z
    .string()
    .min(1, "CORS_ORIGIN is required (comma-separated list allowed)"),

  API_KEY_PEPPER: z
    .string()
    .min(16, "API_KEY_PEPPER must be a long random secret")
    .default("dev-only-insecure-pepper-change-me"),

  WEBHOOK_DEFAULT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),

  CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),

  // z.coerce.boolean() would treat the string "false" as true (any non-empty
  // string is truthy); stringbool() parses "true"/"false"/"1"/"0"/etc. properly.
  TRUST_PROXY: z.stringbool().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment configuration:",
    z.flattenError(parsed.error).fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV == "production";
