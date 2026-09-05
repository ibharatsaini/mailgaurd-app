import pino from "pino";
import { env, isProduction } from "./env";


export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.hashedKey",
      "*.secret",
    ],
    remove: true,
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
  base: { env: env.NODE_ENV },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
