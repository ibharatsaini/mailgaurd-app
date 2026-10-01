import type { Response } from "express";
import { prisma } from "../db/prisma";
import { env, isProduction } from "../config/env";

export interface CreateSessionInput {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}

export async function createSession(input: CreateSessionInput) {
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  );
  return prisma.session.create({
    data: {
      userId: input.userId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
    },
  });
}

export async function getActiveSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  return session;
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setSessionCookie(res: Response, sessionId: string) {
  res.cookie(env.SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction, // HTTPS only in production (Render/Vercel are HTTPS)
    sameSite: isProduction ? "none" : "lax", // cross-site cookie needed: Vercel frontend, Render API
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
}
