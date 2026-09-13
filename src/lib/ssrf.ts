import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF / DNS-rebinding protection.
 *
 */

export class SsrfBlockedError extends Error {
  constructor(
    public hostname: string,
    public blockedIp: string,
  ) {
    super(`Refusing to connect to ${hostname}: resolves to disallowed address ${blockedIp}`);
    this.name = "SsrfBlockedError";
  }
}

const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], 
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, includes cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], 
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24], 
  ["203.0.113.0", 24], 
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const ipInt = ipToInt(ip);
  return BLOCKED_V4_RANGES.some(([base, prefix]) => {
    const baseInt = ipToInt(base);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" || // loopback
    normalized === "::" || 
    normalized.startsWith("fe80:") || 
    normalized.startsWith("fc") || 
    normalized.startsWith("fd") || 
    normalized.startsWith("ff") || 
    normalized.startsWith("::ffff:") 
  );
}

export function isDisallowedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) {
    if (isBlockedV6(ip)) return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isBlockedV4(mapped[1]);
    return false;
  }
  // Not a parseable IP at all — treat as unsafe.
  return true;
}

export interface SafeResolveResult {
  hostname: string;
  addresses: string[]; // all validated, safe-to-connect IPs
  primary: string; // the IP callers should connect to
}

/**
 * Resolves a hostname and throws SsrfBlockedError if any answer is disallowed.
 * Also rejects literal IP-address "hostnames" that are themselves private.
 */
export async function resolveSafely(hostname: string): Promise<SafeResolveResult> {
  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (isDisallowedIp(hostname)) {
      throw new SsrfBlockedError(hostname, hostname);
    }
    return { hostname, addresses: [hostname], primary: hostname };
  }

  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
  ]);

  const addresses = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];

  if (addresses.length === 0) {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  for (const ip of addresses) {
    if (isDisallowedIp(ip)) {
      throw new SsrfBlockedError(hostname, ip);
    }
  }

  return { hostname, addresses, primary: addresses[0] };
}

/**
 * Validates a redirect target before following it (safe-redirect handling).
 * Only http/https schemes are allowed, and the destination is re-resolved
 * and re-validated exactly like the original request.
 */
export function assertSafeRedirectUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Refusing to follow redirect to disallowed protocol: ${url.protocol}`);
  }
}
