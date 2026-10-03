import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import {
  createDomainSchema,
  updateMonitoringConfigSchema,
  INTERVAL_TO_MS,
} from "../validators/domain.schema";
import { AppError } from "../middleware/errorHandler";
import {
  enqueueManualCheck,
  upsertScheduledCheck,
  removeScheduledCheck,
} from "../queues/domainCheck.queue";
import { runDomainCheck } from "../services/domain.service";


type IdParams = { id: string };

const FREE_PLAN_DOMAIN_LIMIT = 5;
const FREE_PLAN_MIN_INTERVAL_MS = INTERVAL_TO_MS.HOUR_1; // free users can't schedule faster than hourly

async function getOwnedDomainOrThrow(userId: string, domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    include: { monitoringConfig: true },
  });
  if (!domain || domain.userId !== userId) {
    // 404, not 403 — don't reveal that the resource exists for another user.
    throw new AppError(404, "not_found", "Domain not found");
  }
  return domain;
}

export async function listDomains(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const domains = await prisma.domain.findMany({
      where: { userId: req.userId },
      include: {
        monitoringConfig: true,
        checks: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ domains });
  } catch (err) {
    next(err);
  }
}

export async function createDomain(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = createDomainSchema.parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
    });
    if (user.plan === "FREE") {
      const count = await prisma.domain.count({ where: { userId: user.id } });
      if (count >= FREE_PLAN_DOMAIN_LIMIT) {
        throw new AppError(
          403,
          "plan_limit_exceeded",
          `Free plan is limited to ${FREE_PLAN_DOMAIN_LIMIT} domains. Upgrade to add more.`,
        );
      }
    }

    const existing = await prisma.domain.findUnique({
      where: { userId_hostname: { userId: user.id, hostname: input.hostname } },
    });
    if (existing) {
      throw new AppError(
        409,
        "domain_exists",
        "This domain is already being monitored",
      );
    }

    const domain = await prisma.domain.create({
      data: {
        userId: user.id,
        hostname: input.hostname,
        dkimSelectors: input.dkimSelectors,
        monitoringConfig: { create: { enabled: true, interval: "HOUR_6" } },
      },
      include: { monitoringConfig: true },
    });

    await upsertScheduledCheck(domain.id, INTERVAL_TO_MS.HOUR_6);
    await enqueueManualCheck(domain.id, "manual"); // run an immediate first check

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "domain.created",
        metadata: { domainId: domain.id, hostname: domain.hostname },
      },
    });

    res.status(201).json({ domain });
  } catch (err) {
    next(err);
  }
}

export async function getDomain(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    const latestCheck = await prisma.domainCheck.findFirst({
      where: { domainId: domain.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ domain, latestCheck });
  } catch (err) {
    next(err);
  }
}

export async function deleteDomain(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    await removeScheduledCheck(domain.id);
    await prisma.domain.delete({ where: { id: domain.id } });
    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: "domain.deleted",
        metadata: { domainId: domain.id, hostname: domain.hostname },
      },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function triggerCheck(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    console.log(`domain `,domain)
    const triggeredBy = req.authMethod === "api_key" ? "api" : "manual";
    console.log(`triggeredBy `,triggeredBy)

    const job = await enqueueManualCheck(domain.id, triggeredBy);
    console.log(job, "JOB")
    res.status(202).json({ message: "Check queued", jobId: job.id  as any});
  } catch (err) {
    next(err);
  }
}

export async function listChecks(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    const limit = Math.min(
      parseInt(String(req.query.limit ?? "20"), 10) || 20,
      100,
    );
    const checks = await prisma.domainCheck.findMany({
      where: { domainId: domain.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ checks });
  } catch (err) {
    next(err);
  }
}

export async function listIssues(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    const onlyUnresolved = req.query.status !== "all";
    const issues = await prisma.domainIssue.findMany({
      where: {
        domainId: domain.id,
        ...(onlyUnresolved ? { resolvedAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ issues });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    const days = Math.min(
      parseInt(String(req.query.days ?? "30"), 10) || 30,
      90,
    );
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const checks = await prisma.domainCheck.findMany({
      where: { domainId: domain.id, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { id: true, healthScore: true, status: true, createdAt: true },
    });
    res.json({ history: checks });
  } catch (err) {
    next(err);
  }
}

export async function updateMonitoringConfig(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction,
) {
  try {
    const domain = await getOwnedDomainOrThrow(req.userId!, req.params.id);
    const input = updateMonitoringConfigSchema.parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
    });
    if (
      user.plan === "FREE" &&
      input.interval &&
      INTERVAL_TO_MS[input.interval] < FREE_PLAN_MIN_INTERVAL_MS
    ) {
      throw new AppError(
        403,
        "plan_limit_exceeded",
        "Free plan monitoring frequency is limited to hourly or slower. Upgrade for more frequent checks.",
      );
    }

    const config = await prisma.monitoringConfig.update({
      where: { domainId: domain.id },
      data: input,
    });

    if (config.enabled) {
      // Upserting a job scheduler replaces any existing schedule for this domain,
      // so an interval change needs no separate remove step.
      await upsertScheduledCheck(domain.id, INTERVAL_TO_MS[config.interval]);
    } else {
      await removeScheduledCheck(domain.id);
    }

    await prisma.auditLog.create({
      data: {
        userId: req.userId,
        action: "domain.monitoring_updated",
        metadata: { domainId: domain.id, ...input },
      },
    });

    res.json({ monitoringConfig: config });
  } catch (err) {
    next(err);
  }
}
