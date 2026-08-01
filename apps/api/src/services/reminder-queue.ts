/**
 * The BullMQ implementation of DispatchQueue (ARCHITECTURE.md §5).
 *
 * The queue is what makes an at-least-once cron safe. Vercel can fire twice, a
 * retry can overlap a slow run, and the endpoint can be curled by hand — the
 * deterministic job id turns all three into one notification.
 *
 * Connections are created per dispatch and closed at the end. On serverless there
 * is no process to keep a pool warm, and a leaked connection outlives the request
 * that made it.
 */

import type { DispatchQueue, ReminderJob } from "@tracker/reminders";
import { JOB_DEFAULTS, JOB_NAMES, QUEUE_NAMES } from "@tracker/shared";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import { env } from "../env.js";
import { AppError, ERROR_CODES } from "../errors.js";
import { logger } from "../logger.js";

export interface QueueHandle {
  queue: DispatchQueue;
  close: () => Promise<void>;
}

/**
 * Builds a queue bound to a fresh Redis connection.
 *
 * Throws rather than silently degrading to direct sending: without Redis there is
 * no dedupe, and a cron that quietly loses its idempotency would double-notify
 * people at the exact moment nobody is watching.
 */
export function createReminderQueue(): QueueHandle {
  if (env.REDIS_URL === undefined || env.REDIS_URL === "") {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      503,
      "Reminder dispatch needs REDIS_URL — without it there is no idempotency",
    );
  }

  /**
   * Bounded connection settings.
   *
   * A cron invocation has a deadline, so an unreachable Redis has to fail fast and
   * loudly rather than hang until the platform kills the function — which would
   * look like a silent no-op with a green tick beside it. ioredis retries forever
   * by default; returning null from retryStrategy stops it after a few tries so
   * commands reject and the endpoint can answer 503.
   */
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy: (attempt) => (attempt > 2 ? null : 200),
  });

  // Swallow the connection error event; the failure surfaces on the command
  // instead, where it can be turned into a response. An unhandled 'error' would
  // take the process down.
  connection.on("error", (error) => {
    logger.warn("reminder queue redis error", { error: error.message });
  });

  const bull = new Queue(QUEUE_NAMES.PUSH, {
    connection,
    defaultJobOptions: JOB_DEFAULTS,
  });

  const queue: DispatchQueue = {
    /**
     * `add` is atomic on the job id — a duplicate is dropped by the queue, not by
     * us. The `getJob` beforehand only classifies the outcome for the summary; two
     * concurrent callers can both see "absent" and both add, and the queue still
     * ends up with one job.
     */
    add: async (jobId, job) => {
      const existing = await bull.getJob(jobId);
      if (existing !== undefined) return { deduped: true };

      await bull.add(JOB_NAMES.SEND_PUSH, job, { jobId });
      return { deduped: false };
    },

    /**
     * Drains inline.
     *
     * A short-lived Worker with `autorun: false` lets us pull exactly the jobs we
     * want and stop, instead of leaving a resident processor behind. The worker's
     * per-job lock is what stops a concurrent dispatch delivering the same job.
     */
    drain: async (max, handler) => {
      let processed = 0;
      let failed = 0;

      const worker = new Worker(
        QUEUE_NAMES.PUSH,
        async (job) => {
          await handler(job.data as ReminderJob);
        },
        { connection, autorun: false, concurrency: 4 },
      );

      try {
        const token = `dispatch-${Date.now()}`;
        while (processed < max) {
          const job = await worker.getNextJob(token);
          if (job === undefined) break;

          processed += 1;
          try {
            await handler(job.data as ReminderJob);
            await job.moveToCompleted(undefined, token, false);
          } catch (error) {
            failed += 1;
            // Back to the queue with BullMQ's own backoff — the next tick or a
            // retry picks it up.
            await job.moveToFailed(
              error instanceof Error ? error : new Error(String(error)),
              token,
              false,
            );
          }
        }
      } finally {
        await worker.close();
      }

      return { processed, failed };
    },
  };

  return {
    queue,
    close: async () => {
      await bull.close();
      await connection.quit().catch(() => connection.disconnect());
      logger.debug("reminder queue closed");
    },
  };
}
