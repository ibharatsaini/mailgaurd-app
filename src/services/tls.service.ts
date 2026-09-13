import tls from "node:tls";
import type { CheckResult } from "./dns.service";
import { resolveSafely, isDisallowedIp } from "../lib/ssrf";

interface TlsCheckDetails {
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  issuer?: string;
  subject?: string;
  protocol?: string | null;
  error?: string;
}

const EXPIRY_WARNING_DAYS = 21;

// X.509 name attributes can legitimately repeat, so Node types them as
// `string | string[]`; we only ever want the first value for display.
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function checkTls(hostname: string, timeoutMs: number): Promise<CheckResult<TlsCheckDetails>> {
  const start = Date.now();
  try {
    const safe = await resolveSafely(hostname);

    const details = await new Promise<TlsCheckDetails>((resolve, reject) => {
      const socket = tls.connect(
        {
          host: safe.primary, // dial the pre-validated IP directly (no rebinding TOCTOU)
          servername: hostname, // still send correct SNI + validate cert against the real hostname
          port: 443,
          timeout: timeoutMs,
          rejectUnauthorized: false, // we want to inspect invalid certs too, and report that explicitly
        },
        () => {
          const cert = socket.getPeerCertificate();
          const authorized = socket.authorized;
          const authError = socket.authorizationError;
          const protocol = socket.getProtocol();
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({ error: "No certificate presented by server" });
            return;
          }

          const validTo = new Date(cert.valid_to);
          const daysUntilExpiry = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

          const issuerName = firstValue(cert.issuer?.O) || firstValue(cert.issuer?.CN);
          const subjectName = firstValue(cert.subject?.CN);

          resolve({
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysUntilExpiry,
            issuer: issuerName,
            subject: subjectName,
            protocol,
            error: authorized ? undefined : `Certificate not trusted: ${authError}`,
          });
        },
      );

      socket.on("lookup", (err, address) => {
        if (!err && address && isDisallowedIp(address)) {
          socket.destroy(new Error(`SSRF guard: socket resolved to disallowed address ${address}`));
        }
      });

      socket.on("timeout", () => socket.destroy(new Error(`TLS handshake timed out after ${timeoutMs}ms`)));
      socket.on("error", (err) => reject(err));
    });

    const latencyMs = Date.now() - start;

    if (details.error && !details.daysUntilExpiry) {
      return { status: "FAIL", latencyMs, summary: details.error, details };
    }
    if (details.error) {
      return { status: "WARN", latencyMs, summary: details.error, details };
    }
    if (details.daysUntilExpiry !== undefined && details.daysUntilExpiry < 0) {
      return { status: "FAIL", latencyMs, summary: `Certificate expired ${Math.abs(details.daysUntilExpiry)} days ago`, details };
    }
    if (details.daysUntilExpiry !== undefined && details.daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
      return { status: "WARN", latencyMs, summary: `Certificate expires in ${details.daysUntilExpiry} days`, details };
    }
    return { status: "PASS", latencyMs, summary: `Valid certificate, expires in ${details.daysUntilExpiry} days`, details };
  } catch (err) {
    return {
      status: "ERROR",
      latencyMs: Date.now() - start,
      summary: `TLS check failed: ${(err as Error).message}`,
      details: { error: (err as Error).message },
    };
  }
}
