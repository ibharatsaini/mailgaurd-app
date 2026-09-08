import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { registerSchema, loginSchema } from "../validators/auth.schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { createSession, setSessionCookie, revokeSession, clearSessionCookie } from "../lib/session";
import { AppError } from "../middleware/errorHandler";
import { env } from "../config/env";

function toPublicUser(user: { id: string; email: string; plan: string; createdAt: Date }) {
  return { id: user.id, email: user.email, plan: user.plan, createdAt: user.createdAt };
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, "email_taken", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({ data: { email: input.email, passwordHash } });

    const session = await createSession({ userId: user.id, userAgent: req.headers["user-agent"], ipAddress: req.ip });
    setSessionCookie(res, session.id);

    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.register", ipAddress: req.ip } });

    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Constant-shape response whether the email exists or not, to avoid
    // user enumeration via response differences.
    const valid = user && await verifyPassword(user.passwordHash, input.password)

    if (!user || !valid) {
      await prisma.auditLog.create({ data: { action: "auth.login_failed", ipAddress: req.ip, metadata: { email: input.email } } });
      throw new AppError(401, "invalid_credentials", "Invalid email or password");
    }

    const session = await createSession({ userId: user.id, userAgent: req.headers["user-agent"], ipAddress: req.ip });
    setSessionCookie(res, session.id);

    await prisma.auditLog.create({ data: { userId: user.id, action: "auth.login", ipAddress: req.ip } });

    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (sessionId) {
      await revokeSession(sessionId);
    }
    clearSessionCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}
