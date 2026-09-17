import crypto from "node:crypto";

/**
 * Signs a webhook payload over
 * `${timestamp}.${rawBody}`, so the receiver can verify both authenticity and
 * freshness (reject replayed deliveries older than a tolerance window).
 */
export function signWebhookPayload(secret: string, rawBody: string, timestamp: number): string {
  const signedContent = `${timestamp}.${rawBody}`;
  return crypto.createHmac("sha256", secret).update(signedContent).digest("hex");
}

export function buildSignatureHeader(secret: string, rawBody: string): { header: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, rawBody, timestamp);
  return { header: `t=${timestamp},v1=${signature}`, timestamp };
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}
