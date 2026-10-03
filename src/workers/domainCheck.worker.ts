import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { QUEUE_NAMES } from "../queues/queues";
import { runDomainCheck } from "../services/domain.service";
import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import type { DomainCheckJobData } from "../queues/domainCheck.queue";
import { enqueueWebhookEvent } from "../services/webhook.service";

// Concurrency chosen conservatively: each job makes several outbound network
// calls (DNS/HTTP/TLS), so we bound parallelism to avoid overwhelming the
// worker's file-descriptor/socket limits or looking like a port-scanner to
// downstream mail servers.
const CONCURRENCY = 5;

export function startDomainCheckWorker() {
  console.log(`sTART OMAIN CHECK WORKER`)
  const worker = new Worker<DomainCheckJobData>(
    QUEUE_NAMES.DOMAIN_CHECK,
    async (job: Job<DomainCheckJobData>) => {
      const { domainId, triggeredBy } = job.data;
      console.log(`inside startDomainCheckWorker`)
      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) {
        // Domain was deleted after the job was enqueued — not an error, just
        // stale work. Complete the job silently instead of retrying forever.
        logger.info({ domainId }, "Skipping check for deleted domain");
        return { skipped: true };
      }
      console.log(worker.name , "Worker name")
      return runDomainCheck(domainId, triggeredBy);
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
      // Guards against a hung DNS/socket call wedging a worker slot forever.
      lockDuration: 60_000,
    },
  );

  worker.on("failed", async (job, err) => {
    logger.error({ jobId: job?.id, domainId: job?.data?.domainId, err: err.message, attemptsMade: job?.attemptsMade }, "Domain check job failed");

    // Only notify on final failure (retries exhausted), not every transient attempt.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const domain = await prisma.domain.findUnique({ where: { id: job.data.domainId } });
      if (domain) {
        await enqueueWebhookEvent(domain.userId, "DOMAIN_MONITORING_FAILED", {
          domainId: domain.id,
          hostname: domain.hostname,
          error: err.message,
        });
      }
    }
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, domainId: job.data.domainId }, "Domain check job completed");
  });

  return worker;
}
