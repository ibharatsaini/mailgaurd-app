import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { env } from "./config/env";
import { requestId } from "./middleware/requestId";
import { apiRateLimit } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import apiV1Routes from "./routes";

export function createApp() {
  const app = express();

  // Render/Vercel sit behind a reverse proxy; trust it for correct req.ip /
  // secure-cookie detection without opening us up to IP spoofing from
  // arbitrary clients.
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as any).id,
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
      crossOriginResourcePolicy: { policy: "cross-origin" }, // API is consumed by a separate origin (Vercel)
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin))
          return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true, // required so the session cookie is sent cross-origin (Vercel -> Render)
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.use(express.json({ limit: "100kb" })); // small limit: this API never needs large bodies
  app.use(cookieParser());
  app.use(apiRateLimit);

  app.get("/health", (_req, res) =>
    res.json({ status: "ok", timestamp: new Date().toISOString() }),
  );

  app.use("/api/v1", apiV1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
