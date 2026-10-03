import { createApp } from "./app";
import { env, isProduction } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { redisConnection } from "./config/redis";
import { startWorkers } from "./workers";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "MailGuard API listening");
});
const workers = startWorkers();

async function shutdown(signal: string) {
  logger.info({ signal }, "API shutting down gracefully");
  server.close(async () => {
    await workers?.close();

    await prisma.$disconnect();
    redisConnection.disconnect();
    process.exit(0);
  });
  // Force-exit if normal shutdown hangs
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
