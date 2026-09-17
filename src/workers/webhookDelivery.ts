import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { QUEUE_NAMES } from "../queues/queues";
import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import { buildSignatureHeader } from "../lib/signing";
import { resolveSafely, isDisallowedIp } from "../lib/ssrf";
import { env } from "../config/env";
import type { WebhookDeliveryJobData } from "../queues/webhookDelivery.queue";
import https from "node:https";
import http from "node:http";

const CONCURRENCY = 10;

// Non-2xx responses are failures that still carry a status code worth recording.
class WebhookHttpError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Webhook receiver responded with HTTP ${statusCode}`);
  }
}

async function deliverOnce(url: string, secret: string, body: string): Promise<{ statusCode: number }> {
  const target = new URL(url);
  // Same SSRF discipline as domain checks: user-supplied webhook URLs are
  // just as capable of pointing at an internal service as a monitored domain.
  const safe = await resolveSafely(target.hostname);
  const { header } = buildSignatureHeader(secret, body);
  const isHttps = target.protocol === "https:";
  const lib = isHttps ? https : http;
  const port = target.port ? parseInt(target.port, 10) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        host: safe.primary,
        port,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          Host: target.hostname,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-MailGuard-Signature": header,
          "User-Agent": "MailGuard-Webhooks/1.0",
        },
        timeout: env.WEBHOOK_DEFAULT_TIMEOUT_MS,
        ...(isHttps ? { servername: target.hostname } : {}),
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0 }));
      },
    );

    req.on("socket", (socket) => {
      socket.on("lookup", (err, address) => {
        if (!err && address && isDisallowedIp(address)) {
          req.destroy(new Error(`SSRF guard: webhook target resolved to disallowed address ${address}`));
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error("Webhook delivery timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

export function startWebhookDeliveryWorker() {
  const worker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job: Job<WebhookDeliveryJobData>) => {
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: job.data.deliveryId },
        include: { webhook: true },
      });

      if (!delivery || !delivery.webhook.isActive) {
        return { skipped: true };
      }

      const body = JSON.stringify({ event: delivery.event, data: delivery.payload, deliveryId: delivery.id });

      try {
        const { statusCode } = await deliverOnce(delivery.webhook.url, delivery.webhook.secret, body);
        if (statusCode < 200 || statusCode >= 300) {
          throw new WebhookHttpError(statusCode);
        }

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SUCCESS",
            attempts: { increment: 1 },
            responseCode: statusCode,
            deliveredAt: new Date(),
          },
        });
        return { statusCode };
      } catch (err) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: job.attemptsMade + 1 >= (job.opts.attempts ?? 1) ? "EXHAUSTED" : "FAILED",
            attempts: { increment: 1 },
            errorMessage: (err as Error).message,
            ...(err instanceof WebhookHttpError ? { responseCode: err.statusCode } : {}),
          },
        });
        throw err; // let BullMQ retry with backoff
      }
    },
    { connection: redisConnection, concurrency: CONCURRENCY },
  );

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, deliveryId: job?.data?.deliveryId, err: err.message }, "Webhook delivery attempt failed");
  });

  return worker;
}
