/**
 * The reminder worker (ARCHITECTURE.md §5).
 *
 * Two BullMQ workers in one process:
 *   - the **reminders** queue runs the repeatable sweep, which scans every user in
 *     their own timezone and enqueues the specific pushes that are due;
 *   - the **push** queue does the actual web-push delivery, one job per (user,
 *     thing, day), deduped by a deterministic jobId.
 *
 * Separate from the API on purpose: a slow push service must never hold up a
 * request, and the worker can be restarted or scaled without touching the app.
 */

import { JOB_NAMES, QUEUE_NAMES, notificationTag } from "@tracker/shared";
import { Worker } from "bullmq";
import mongoose from "mongoose";

import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { createConnection, createQueues, enqueueReminders, reconcileRepeatables } from "./queues.js";
import { SCANNERS, type ReminderJob } from "./reminders/scan.js";
import { configureWebPush, sendToUser } from "./reminders/sender.js";
import { captureError, initSentry } from "./sentry.js";

async function main(): Promise<void> {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN, env.NODE_ENV);
  configureWebPush(env);

  await mongoose.connect(env.MONGODB_URI);
  logger.info("mongo connected");

  const connection = createConnection(env.REDIS_URL);
  const queues = createQueues(connection);

  /**
   * The sweep. Runs every scan interval, asks each scanner what is due right now,
   * and enqueues the result. Scanners are independent: one throwing must not stop
   * the others from getting their reminders out.
   */
  const remindersWorker = new Worker(
    QUEUE_NAMES.REMINDERS,
    async () => {
      const now = new Date();
      let enqueued = 0;

      for (const [name, scan] of Object.entries(SCANNERS)) {
        try {
          const jobs = await scan(now);
          enqueued += await enqueueReminders(queues.push, jobs);
          if (jobs.length > 0) logger.info("scan produced jobs", { scan: name, count: jobs.length });
        } catch (error) {
          logger.error("scan failed", { scan: name, error });
          captureError(error, { scan: name });
        }
      }

      return { enqueued };
    },
    { connection, concurrency: 1 },
  );

  /** Delivery. One job = one (user, thing, day). */
  const pushWorker = new Worker(
    QUEUE_NAMES.PUSH,
    async (job) => {
      if (job.name !== JOB_NAMES.SEND_PUSH) return;
      const reminder = job.data as ReminderJob;

      const result = await sendToUser(reminder.userId, {
        title: reminder.title,
        body: reminder.body,
        tag: notificationTag(reminder.kind),
        url: reminder.url,
      });

      logger.info("reminder delivered", { jobId: job.id, kind: reminder.kind, ...result });

      // Transient failures with nothing delivered → let BullMQ back off and retry.
      if (result.sent === 0 && result.failed > 0) {
        throw new Error(`No device accepted the push (${result.failed} transient failures)`);
      }
      return result;
    },
    { connection, concurrency: 4 },
  );

  for (const worker of [remindersWorker, pushWorker]) {
    worker.on("failed", (job, error) => {
      logger.error("job failed", { queue: worker.name, jobId: job?.id, error: error.message });
      captureError(error, { queue: worker.name, jobId: job?.id });
    });
  }

  await reconcileRepeatables(queues.reminders, env.SCAN_INTERVAL_MINUTES);
  logger.info("worker ready", { scanIntervalMinutes: env.SCAN_INTERVAL_MINUTES });

  /** Drain in flight rather than dropping a half-sent batch. */
  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutting down", { signal });
    await Promise.allSettled([remindersWorker.close(), pushWorker.close()]);
    await queues.close();
    await connection.quit();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.error("worker failed to start", { error });
  captureError(error);
  process.exit(1);
});
