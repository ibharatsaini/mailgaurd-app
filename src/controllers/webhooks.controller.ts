import type { Request, Response, NextFunction } from "express";
import type { Webhook } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import { createWebhookSchema } from "../validators/webhook.schema";
import { generateWebhookSecret } from "../lib/signing";
import { AppError } from "../middleware/errorHandler";

// Express 5 types `req.params` values as `string | string[]` (wildcard params can be
// arrays); every route here uses a single named `:id` segment, which is always a string.
type IdParams = { id: string };

export async function listWebhooks(req: Request, res: Response, next: NextFunction) {
  try {
    const webhooks = await prisma.webhook.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
    // Never return the raw secret after creation.
    res.json({ webhooks: webhooks.map(({ secret, ...w }: Webhook) => w) });
  } catch (err) {
    next(err);
  }
}

export async function createWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createWebhookSchema.parse(req.body);
    const secret = generateWebhookSecret();

    const webhook = await prisma.webhook.create({
      data: { userId: req.userId!, url: input.url, events: input.events, secret },
    });

    await prisma.auditLog.create({ data: { userId: req.userId, action: "webhook.created", metadata: { webhookId: webhook.id, url: webhook.url } } });

    // Secret is shown once at creation time, same policy as API keys.
    res.status(201).json({ webhook: { ...webhook, secret: undefined }, secret });
  } catch (err) {
    next(err);
  }
}

export async function deleteWebhook(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!webhook || webhook.userId !== req.userId) {
      throw new AppError(404, "not_found", "Webhook not found");
    }
    await prisma.webhook.delete({ where: { id: webhook.id } });
    await prisma.auditLog.create({ data: { userId: req.userId, action: "webhook.deleted", metadata: { webhookId: webhook.id } } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listDeliveries(req: Request<IdParams>, res: Response, next: NextFunction) {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!webhook || webhook.userId !== req.userId) {
      throw new AppError(404, "not_found", "Webhook not found");
    }
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: webhook.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ deliveries });
  } catch (err) {
    next(err);
  }
}
