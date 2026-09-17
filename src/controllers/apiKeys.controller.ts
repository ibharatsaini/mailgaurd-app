import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { createApiKeySchema } from "../validators/apiKey.schema";
import { generateApiKey } from "../lib/apiKey";
import { AppError } from "../middleware/errorHandler";

type IdParams = { id: string };

function toPublicApiKey(key: { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date }) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const keys = await prisma.apiKey.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
    res.json({ apiKeys: keys.map(toPublicApiKey) });
  } catch (err) {
    next(err);
  }
}

export async function createApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createApiKeySchema.parse(req.body);
    const { plaintext, prefix, hashedKey } = generateApiKey();

    const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000) : null;

    const apiKey = await prisma.apiKey.create({
      data: { userId: req.userId!, name: input.name, prefix, hashedKey, scopes: input.scopes, expiresAt },
    });

    await prisma.auditLog.create({ data: { userId: req.userId, action: "api_key.created", metadata: { apiKeyId: apiKey.id, name: apiKey.name } } });

    // The plaintext key is returned exactly once and never persisted or logged.
    res.status(201).json({ apiKey: toPublicApiKey(apiKey), plaintextKey: plaintext });
  } catch (err) {
    next(err);
  }
}

export async function revokeApiKey(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const apiKey = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!apiKey || apiKey.userId !== req.userId) {
      throw new AppError(404, "not_found", "API key not found");
    }
    if (apiKey.revokedAt) {
      return res.json({ apiKey: toPublicApiKey(apiKey) });
    }

    const updated = await prisma.apiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: req.userId, action: "api_key.revoked", metadata: { apiKeyId: apiKey.id } } });

    res.json({ apiKey: toPublicApiKey(updated) });
  } catch (err) {
    next(err);
  }
}
