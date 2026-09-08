import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { logger } from "../config/logger";
import { isProduction } from "../config/env";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: `No route matches ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "validation_error",
      message: "Request failed validation",
      details: z.flattenError(err),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.code, message: err.message });
  }

  const requestId = (req as any).id;
  logger.error({ err, requestId, path: req.path, method: req.method }, "Unhandled error");

  return res.status(500).json({
    error: "internal_error",
    message: isProduction ? "An unexpected error occurred" : (err as Error)?.message,
    requestId,
  });
}
