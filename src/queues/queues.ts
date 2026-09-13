import { Queue, QueueEvents } from "bullmq";
import { redisConnection } from "../config/redis";

export const QUEUE_NAMES = {
  DOMAIN_CHECK: "domain-check",
  WEBHOOK_DELIVERY: "webhook-delivery",
} as const;

const defaultQueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 }, // keep failed jobs a week for debugging
  },
};

export const domainCheckQueue = new Queue(QUEUE_NAMES.DOMAIN_CHECK, defaultQueueOptions);
export const webhookQueue = new Queue(QUEUE_NAMES.WEBHOOK_DELIVERY, defaultQueueOptions);

export const domainCheckQueueEvents = new QueueEvents(QUEUE_NAMES.DOMAIN_CHECK, { connection: redisConnection });
