import { webhookQueue } from "./queues";

export const webhookDeliveryQueue = webhookQueue;

export interface WebhookDeliveryJobData {
  deliveryId: string;
}
