import { logger } from "./config/logger";
import { startDomainCheckWorker } from "./workers/domainCheck.worker";
import { startWebhookDeliveryWorker } from "./workers/webhookDelivery";

logger.info("Starting MailGuard background worker process");

const domainCheckWorker = startDomainCheckWorker();
const webhookWorker = startWebhookDeliveryWorker();

async function shutdown(signal: string) {
  logger.info({ signal }, "Worker shutting down gracefully");
  await Promise.all([domainCheckWorker.close(), webhookWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection in worker");
});
