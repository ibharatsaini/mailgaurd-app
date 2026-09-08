import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { getActiveSession } from "../lib/session";
import { hashApiKey, looksLikeApiKey } from "../lib/apiKey";
import { prisma } from "../db/prisma";
import type { ApiKeyScope } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      authMethod?: "session" | "api_key";
      apiKeyScopes?: ApiKeyScope[];
    }
  }
}

/**
 * Accepts EITHER a valid session cookie (browser/dashboard use) OR a bearer
 * API key (`Authorization: Bearer mg_live_...`, programmatic use). Both paths
 * converge on the same `req.userId`, so downstream ownership checks don't
 * need to care which auth method was used.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      if (!looksLikeApiKey(token)) {
        return res.status(401).json({ error: "invalid_api_key", message: "Malformed API key" });
      }
      const hashed = hashApiKey(token);
      const apiKey = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });

      if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
        return res.status(401).json({ error: "invalid_api_key", message: "API key is invalid, revoked, or expired" });
      }

      prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

      req.userId = apiKey.userId;
      req.authMethod = "api_key";
      req.apiKeyScopes = apiKey.scopes;
      return next();
    }

    const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!sessionId) {
      return res.status(401).json({ error: "unauthenticated", message: "No session or API key provided" });
    }

    const session = await getActiveSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: "unauthenticated", message: "Session is invalid, expired, or revoked" });
    }

    req.userId = session.userId;
    req.authMethod = "session";
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Restricts an API-key-authenticated request to keys carrying a given scope. Session auth always passes (full account access). */
export function requireScope(scope: ApiKeyScope) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authMethod === "session") return next();
    if (req.authMethod === "api_key" && req.apiKeyScopes?.includes(scope)) return next();
    return res.status(403).json({ error: "insufficient_scope", message: `This action requires the '${scope}' scope` });
  };
}
