import crypto from "node:crypto";
import { env } from "../config/env";

// API keys are shown to the user exactly once. We only ever persist a
// SHA-256(HMAC-peppered) hash

const KEY_PREFIX = "mg_live_";

export function generateApiKey(): { plaintext: string; prefix: string; hashedKey: string } {
  const random = crypto.randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const prefix = plaintext.slice(0, 16);
  const hashedKey = hashApiKey(plaintext);
  return { plaintext, prefix, hashedKey };
}

export function hashApiKey(plaintext: string): string {
  
  return crypto.createHmac("sha256", env.API_KEY_PEPPER).update(plaintext).digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX);
}
