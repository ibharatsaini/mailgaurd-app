import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers["x-request-id"] as string) || nanoid(12);
  (req as any).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
