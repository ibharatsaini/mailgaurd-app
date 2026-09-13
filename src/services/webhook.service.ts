import { prisma } from "../db/prisma";
import { webhookDeliveryQueue } from "../queues/webhookDelivery.queue";
import type { WebhookEvent } from "../generated/prisma/client";
import { logger } from "../config/logger";

/**
 * Fans an event out to every active webhook subscribed to it, creating a
 * WebhookDelivery row (status PENDING) up front so delivery state is always
 * queryable even before the queue picks the job up, then enqueues the actual
 * HTTP delivery as a separate BullMQ job so a slow/broken receiver can never
 * block the request path or the check pipeline.
 */
export async function enqueueWebhookEvent(userId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, isActive: true, events: { has: event } },
  });

  if (webhooks.length === 0) return;

  for (const webhook of webhooks) {
    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: webhook.id, event, payload: payload as any, status: "PENDING" },
    });

    await webhookDeliveryQueue.add(
      "deliver",
      { deliveryId: delivery.id },
      {
        jobId: `delivery-${delivery.id}`, // idempotent: never double-enqueue the same delivery (BullMQ forbids ":" in custom ids)
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
  }

  logger.debug({ userId, event, webhookCount: webhooks.length }, "Enqueued webhook deliveries");
}
