import { domainCheckQueue, QUEUE_NAMES } from "./queues";

export interface DomainCheckJobData {
  domainId: string;
  triggeredBy: "manual" | "scheduled" | "api";
}

/**
 * Idempotency / duplicate-job protection: the jobId is derived from the
 * domain and a coarse time bucket, so if a user mashes "run check now"
 * repeatedly, or a repeatable schedule and a manual trigger overlap, BullMQ
 * simply no-ops the duplicate `add()` call (jobId collision) rather than
 * running the same expensive network check twice.
 */
//
// NOTE: BullMQ rejects custom job ids containing ":" (it reserves the colon for
// its own key scheme), so ids here use "-" as the separator.
function manualJobId(domainId: string) {
  // 30-second bucket is enough to absorb accidental double-clicks/retried
  // requests without meaningfully delaying an intentional second check.
  const bucket = Math.floor(Date.now() / 30_000);
  console.log(`Bucket manual job id `, bucket)
  return `manual-${domainId}-${bucket}`;
}

export async function enqueueManualCheck(
  domainId: string,
  triggeredBy: "manual" | "api" = "manual",
) {
  console.log(`Initiating Enqueue: `);
  const enqueued = domainCheckQueue.add(
    // QUEUE_NAMES.DOMAIN_CHECK,
    "check",
    { domainId, triggeredBy } satisfies DomainCheckJobData,
    {
      jobId: manualJobId(domainId),
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
    },
  );
  console.log(`Returned Enqueued `,enqueued);
  return enqueued;
}

function schedulerId(domainId: string) {
  return `scheduled-${domainId}`;
}

export async function upsertScheduledCheck(domainId: string, everyMs: number) {
  return domainCheckQueue.upsertJobScheduler(
    schedulerId(domainId),
    // `startDate` delays the first run by one full interval. Without it a scheduler
    // fires immediately, which would duplicate the immediate check that
    // createDomain already enqueues (and re-fire on every interval change).
    { every: everyMs, startDate: new Date(Date.now() + everyMs) },
    {
      name: "check",
      // name: QUEUE_NAMES.DOMAIN_CHECK,
      data: { domainId, triggeredBy: "scheduled" } satisfies DomainCheckJobData,
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    },
  );
}

export async function removeScheduledCheck(domainId: string) {
  // Resolves to false (not an error) if no scheduler exists for this domain.
  await domainCheckQueue.removeJobScheduler(schedulerId(domainId));
}
