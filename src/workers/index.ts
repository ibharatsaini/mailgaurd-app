import type { Worker } from "bullmq";
import { logger } from "../config/logger";
import { startDomainCheckWorker } from "./domainCheck.worker";
import { startWebhookDeliveryWorker } from "./webhookDelivery";

export interface WorkerHandle {
  close(): Promise<void>;
}

/**
 * Starts every BullMQ worker. Used by both the standalone worker process
 * (src/worker.ts) and, when EMBEDDED_WORKER is on, the API process (src/server.ts).
 *
 * Note: a BullMQ `Worker` begins processing as soon as it is constructed
 * (`autorun` defaults to true), so there is no `worker.run()` to call.
 */
export function startWorkers(): WorkerHandle {
  const workers: Worker<any, any, string>[] = [startDomainCheckWorker(), startWebhookDeliveryWorker()];

  for (const worker of workers) {
    // "ready" proves in the logs that the worker connected to Redis and is polling.
    worker.on("ready", () => logger.info({ queue: worker.name }, "Worker ready and waiting for jobs"));
    // With no "error" listener BullMQ falls back to a bare console.error, so Redis drops and
    // run() failures never reach the structured logger (and are easy to miss in Render's logs).
    worker.on("error", (err) => logger.error({ queue: worker.name, err: err.message }, "Worker error"));
  }

  return {
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
    },
  };
}
