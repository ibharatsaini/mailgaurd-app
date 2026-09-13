import http from "node:http";
import https from "node:https";
import type { CheckResult } from "./dns.service";
import { resolveSafely, assertSafeRedirectUrl, isDisallowedIp } from "../lib/ssrf";

interface HttpTiming {
  dnsLookupMs: number;
  tcpConnectMs: number;
  tlsHandshakeMs: number | null;
  timeToFirstByteMs: number;
  totalMs: number;
}

interface HttpCheckDetails {
  statusCode?: number;
  finalUrl?: string;
  redirected: boolean;
  timing: HttpTiming;
  error?: string;
}

const MAX_REDIRECTS = 5;

/**
 * Performs a single HTTP(S) GET against `hostname`, following redirects
 * manually (so each hop can be re-validated for SSRF) and instrumenting each
 * network phase.
 *
 * We connect directly to the pre-validated IP address rather than letting
 * Node re-resolve the hostname, closing the DNS-rebinding TOCTOU window.
 */
async function performRequest(
  targetUrl: URL,
  timeoutMs: number,
  redirectsLeft: number,
): Promise<HttpCheckDetails> {
  const overallStart = Date.now();
  const safe = await resolveSafely(targetUrl.hostname);
  const dnsLookupMs = Date.now() - overallStart;

  const isHttps = targetUrl.protocol === "https:";
  const lib = isHttps ? https : http;
  const port = targetUrl.port ? parseInt(targetUrl.port, 10) : isHttps ? 443 : 80;

  return new Promise<HttpCheckDetails>((resolve, reject) => {
    const tcpStart = Date.now();
    let tcpConnectMs = 0;
    let tlsHandshakeMs: number | null = null;
    let firstByteMs = 0;

    const req = lib.request(
      {
        host: safe.primary, // connect to the validated IP, not the hostname
        port,
        path: targetUrl.pathname + targetUrl.search,
        method: "GET",
        headers: {
          Host: targetUrl.hostname, // preserve virtual-hosting / SNI-relevant Host header
          "User-Agent": "MailGuard-HealthCheck/1.0 (+https://mailguard.example)",
        },
        timeout: timeoutMs,
        // For HTTPS we must still set servername for correct SNI + cert validation
        // even though we dialed the IP directly.
        ...(isHttps ? { servername: targetUrl.hostname } : {}),
      },
      (res) => {
        firstByteMs = Date.now() - overallStart;
        res.resume(); // drain body, we only need headers/status
        res.on("end", () => {
          const statusCode = res.statusCode ?? 0;
          const location = res.headers.location;

          if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectsLeft > 0) {
            try {
              const nextUrl = new URL(location, targetUrl);
              assertSafeRedirectUrl(nextUrl);
              performRequest(nextUrl, timeoutMs, redirectsLeft - 1)
                .then(resolve)
                .catch(reject);
              return;
            } catch (err) {
              resolve({
                redirected: true,
                statusCode,
                finalUrl: targetUrl.toString(),
                timing: { dnsLookupMs, tcpConnectMs, tlsHandshakeMs, timeToFirstByteMs: firstByteMs, totalMs: Date.now() - overallStart },
                error: `Unsafe redirect target blocked: ${(err as Error).message}`,
              });
              return;
            }
          }

          resolve({
            statusCode,
            finalUrl: targetUrl.toString(),
            redirected: redirectsLeft < MAX_REDIRECTS,
            timing: {
              dnsLookupMs,
              tcpConnectMs,
              tlsHandshakeMs,
              timeToFirstByteMs: firstByteMs,
              totalMs: Date.now() - overallStart,
            },
          });
        });
      },
    );

    req.on("socket", (socket) => {
      socket.on("connect", () => {
        tcpConnectMs = Date.now() - tcpStart;
      });
      socket.on("secureConnect", () => {
        tlsHandshakeMs = Date.now() - tcpStart - tcpConnectMs;
      });
      // Defense in depth: even though we dialed a pre-validated IP, if a
      // library/proxy layer ever re-resolves, double-check the peer address.
      socket.on("lookup", (err, address) => {
        if (!err && address && isDisallowedIp(address)) {
          req.destroy(new Error(`SSRF guard: socket resolved to disallowed address ${address}`));
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on("error", (err) => reject(err));
    req.end();
  });
}

export async function checkHttp(hostname: string, timeoutMs: number): Promise<CheckResult<HttpCheckDetails>> {
  const url = new URL(`https://${hostname}/`);
  const start = Date.now();
  try {
    const details = await performRequest(url, timeoutMs, MAX_REDIRECTS);
    const latencyMs = Date.now() - start;

    if (details.error) {
      return { status: "WARN", latencyMs, summary: details.error, details };
    }
    if (!details.statusCode) {
      return { status: "FAIL", latencyMs, summary: "No response received", details };
    }
    if (details.statusCode >= 500) {
      return { status: "FAIL", latencyMs, summary: `Server error: HTTP ${details.statusCode}`, details };
    }
    if (details.statusCode >= 400) {
      return { status: "WARN", latencyMs, summary: `Client error: HTTP ${details.statusCode}`, details };
    }
    return { status: "PASS", latencyMs, summary: `Reachable (HTTP ${details.statusCode}, ${details.timing.totalMs}ms)`, details };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      status: "ERROR",
      latencyMs,
      summary: `HTTP check failed: ${(err as Error).message}`,
      details: { redirected: false, timing: { dnsLookupMs: 0, tcpConnectMs: 0, tlsHandshakeMs: null, timeToFirstByteMs: 0, totalMs: latencyMs }, error: (err as Error).message },
    };
  }
}
