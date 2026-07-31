/**
 * Queue wiring (ARCHITECTURE.md §5).
 *
 * The queues themselves are thin — the interesting behaviour lives in the scanners
 * and the sender, which are deliberately Redis-free so they can be tested without
 * any of this.
 */

import { JOB_DEFAULTS, JOB_NAMES, QUEUE_NAMES } from "@tracker/shared";
import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

import { logger } from "./logger.js";
import type { ReminderJob } from "./reminders/scan.js";

/**
 * The Redis connection, with its retries made audible.
 *
 * ioredis reconnects forever and silently by default, which means a worker
 * started without Redis logs "mongo connected" and then sits there looking
 * healthy while delivering nothing. Keeping the retry (a Redis restart should
 * heal on its own) but logging every failed attempt is the difference between a
 * worker that is down and a worker that is down *visibly*.
 */
export function createConnection(redisUrl: string): Redis {
  const connection = new Redis(redisUrl, {
    // BullMQ requires this; without it blocking commands throw on reconnect.
    maxRetriesPerRequest: null,
    retryStrategy: (attempt) => {
      const delay = Math.min(attempt * 500, 10_000);
      // Loud for the first few, then every tenth, so a long outage does not
      // drown the log while still proving the worker is alive and trying.
      if (attempt <= 3 || attempt % 10 === 0) {
        logger.error("redis unavailable — reminders are NOT being delivered", {
          attempt,
          retryInMs: delay,
          url: redisUrl.replace(/\/\/.*@/, "//***@"),
        });
      }
      return delay;
    },
  });

  connection.on("ready", () => logger.info("redis connected"));
  connection.on("end", () => logger.warn("redis connection closed"));

  return connection;
}

export interface Queues {
  reminders: Queue;
  push: Queue;
  maintenance: Queue;
  close: () => Promise<void>;
}

export function createQueues(connection: ConnectionOptions): Queues {
  const options = { connection, defaultJobOptions: JOB_DEFAULTS } as const;

  const reminders = new Queue(QUEUE_NAMES.REMINDERS, options);
  const push = new Queue(QUEUE_NAMES.PUSH, options);
  const maintenance = new Queue(QUEUE_NAMES.MAINTENANCE, options);

  return {
    reminders,
    push,
    maintenance,
    close: async () => {
      await Promise.all([reminders.close(), push.close(), maintenance.close()]);
    },
  };
}

/**
 * Enqueue the jobs a scan produced.
 *
 * **This is where idempotency is cashed in.** Each job carries a deterministic id
 * (`checkin-reminder:{userId}:{day}`), and BullMQ silently ignores an add whose
 * jobId already exists — so a scanner that evaluates the same user twice inside one
 * window enqueues one job, not two. The dedupe is the queue's, not ours; we only
 * have to make the id stable.
 */
export async function enqueueReminders(push: Queue, jobs: readonly ReminderJob[]): Promise<number> {
  if (jobs.length === 0) return 0;

  await push.addBulk(
    jobs.map((job) => ({
      name: JOB_NAMES.SEND_PUSH,
      data: job,
      opts: { jobId: job.jobId },
    })),
  );

  return jobs.length;
}

/**
 * Declare the repeatable sweep, removing any stale schedule first.
 *
 * Reconciled rather than blindly re-added: changing the interval leaves the old
 * repeat key behind otherwise, and the sweep would then run on both cadences.
 */
export async function reconcileRepeatables(
  reminders: Queue,
  intervalMinutes: number,
): Promise<void> {
  const every = intervalMinutes * 60_000;

  for (const existing of await reminders.getRepeatableJobs()) {
    if (existing.name === JOB_NAMES.SCAN_CHECKIN_REMINDERS && Number(existing.every) === every) {
      continue;
    }
    await reminders.removeRepeatableByKey(existing.key);
    logger.info("removed stale repeatable", { key: existing.key });
  }

  await reminders.add(
    JOB_NAMES.SCAN_CHECKIN_REMINDERS,
    {},
    {
      repeat: { every },
      // A fixed id keeps the sweep single even across restarts.
      jobId: "sweep",
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  );

  logger.info("sweep scheduled", { everyMinutes: intervalMinutes });
}
