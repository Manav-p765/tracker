/**
 * Cron-triggered dispatch (ARCHITECTURE.md §5).
 *
 * This replaces the always-on `setInterval` sweep. One HTTP call does what one
 * tick of that loop did: scan every user in their own timezone, enqueue the due
 * reminders under deterministic job ids, then drain the batch inline and return a
 * summary. No resident process, which is what makes it deployable on free hosting.
 *
 * **What is deliberately unchanged:** the scanners, the timezone evaluation, the
 * job-id formats, the goal digest threshold, and the 404/410 cleanup. Only the
 * trigger and the processing model moved.
 *
 * ## Why the queue survives a move to "just do it in the request"
 *
 * It would be simpler to scan and send directly. The queue earns its place because
 * cron is *at-least-once*: Vercel can fire twice, a retry can overlap a slow run,
 * and a human can curl the endpoint mid-window. The deterministic job id is what
 * makes all three harmless — the second `add` for `checkin-reminder:{user}:{day}`
 * is dropped by the queue rather than becoming a second notification.
 *
 * ## Overlapping invocations
 *
 * Two dispatches running at once is expected, not exceptional. Two things keep it
 * safe. First, `add` is atomic on the job id: concurrent adds of the same id yield
 * one job. Second, draining takes the queue's per-job lock, so only one invocation
 * ever delivers a given job — the other sees it already claimed and moves on. The
 * worst case is a slightly under-counted `deduped` in the summary (two callers can
 * both observe "absent" before either adds); the *send* still happens once, which
 * is the property that matters.
 *
 * ## Bounded work
 *
 * A dispatch processes at most `maxJobs` and returns. Anything left over is picked
 * up by the next tick, because nothing about the state is per-invocation — the same
 * scan will produce the same ids, and the ones already sent are already deduped.
 * A serverless function that runs out of time mid-batch is therefore not a lost
 * batch, just a slower one.
 */

import { logger } from "./logger.js";
import { SCANNERS, type ReminderJob } from "./scan.js";
import { sendToUser, type DeliveryResult } from "./sender.js";

/**
 * The queue this dispatch needs, narrowed to two operations.
 *
 * Narrow on purpose: the API supplies a BullMQ-backed implementation, and tests
 * supply an in-memory one with the same job-id semantics. Neither the scanners nor
 * this orchestration know which they are talking to.
 */
export interface DispatchQueue {
  /** Adds unless the id already exists. `deduped: true` means it was a repeat. */
  add: (jobId: string, job: ReminderJob) => Promise<{ deduped: boolean }>;
  /**
   * Claims and processes up to `max` pending jobs. The handler runs once per job;
   * a job already claimed by a concurrent drain must not be handed over again.
   */
  drain: (
    max: number,
    handler: (job: ReminderJob) => Promise<void>,
  ) => Promise<{ processed: number; failed: number }>;
}

export interface DispatchSummary {
  /** Reminders the scanners found due in this window. */
  scanned: number;
  /** New jobs accepted by the queue. */
  enqueued: number;
  /** Already queued or already sent this window — the idempotency at work. */
  deduped: number;
  /** Notifications actually delivered to at least one device. */
  sent: number;
  /** Jobs that errored. They stay queued for the next tick or a queue retry. */
  failed: number;
  /** Dead endpoints removed during this run. */
  pruned: number;
  /** True when the cap stopped us early; the next tick continues. */
  truncated: boolean;
}

export interface DispatchOptions {
  /** Injectable for tests; defaults to now. */
  now?: Date;
  /** Cap on jobs processed per invocation, so a request stays bounded. */
  maxJobs?: number;
  /** Overridable for tests. */
  send?: typeof sendToUser;
}

export const DEFAULT_MAX_JOBS = 200;

/**
 * One tick: scan → enqueue → drain.
 *
 * Scanner failures are contained. One scanner throwing must not stop the other
 * three from getting their reminders out — a broken goal query should never
 * silence the evening check-in.
 */
export async function dispatchReminders(
  queue: DispatchQueue,
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const now = options.now ?? new Date();
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const send = options.send ?? sendToUser;

  let scanned = 0;
  let enqueued = 0;
  let deduped = 0;
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const [name, scan] of Object.entries(SCANNERS)) {
    let jobs: ReminderJob[] = [];
    try {
      jobs = await scan(now);
    } catch (error) {
      logger.error("scan failed", { scan: name, error: String(error) });
      failed += 1;
      continue;
    }

    scanned += jobs.length;

    for (const job of jobs) {
      try {
        const result = await queue.add(job.jobId, job);
        if (result.deduped) deduped += 1;
        else enqueued += 1;
      } catch (error) {
        logger.error("enqueue failed", { jobId: job.jobId, error: String(error) });
        failed += 1;
      }
    }
  }

  const drained = await queue.drain(maxJobs, async (job) => {
    const result: DeliveryResult = await send(job.userId, {
      title: job.title,
      body: job.body,
      tag: `tracker:${job.kind}`,
      url: job.url,
    });

    sent += result.sent > 0 ? 1 : 0;
    pruned += result.pruned;

    // Nothing accepted but devices did fail → transient. Throwing keeps the job
    // for a retry rather than marking a reminder delivered that never arrived.
    if (result.sent === 0 && result.failed > 0) {
      throw new Error(`No device accepted the push (${result.failed} transient failures)`);
    }
  });

  failed += drained.failed;

  const summary: DispatchSummary = {
    scanned,
    enqueued,
    deduped,
    sent,
    failed,
    pruned,
    truncated: drained.processed >= maxJobs,
  };

  logger.info("reminder dispatch complete", { ...summary });
  return summary;
}
