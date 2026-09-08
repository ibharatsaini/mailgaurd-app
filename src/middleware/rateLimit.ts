import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Tighter limits on auth endpoints (brute-force/credential-stuffing surface)
// than on general API traffic.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many authentication attempts. Try again later." },
});

// General API traffic. Free-tier plan limits (distinct from this
// infrastructure-level limit) are enforced separately in the domain
// controller based on `req.userId`'s plan.
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests. Please slow down." },
  keyGenerator: (req) => req.userId || (req.ip ? ipKeyGenerator(req.ip) : "anonymous"),
});

// Manual "run check now" is comparatively expensive (real network calls), so
// it gets its own stricter budget independent of general API traffic.
export const checkTriggerRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many check requests. Please slow down." },
  keyGenerator: (req) => req.userId || (req.ip ? ipKeyGenerator(req.ip) : "anonymous"),
});
