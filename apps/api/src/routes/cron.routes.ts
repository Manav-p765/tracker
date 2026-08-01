import { configureWebPush, dispatchReminders } from "@tracker/reminders";
import { Router } from "express";

import { env } from "../env.js";
import { AppError, ERROR_CODES } from "../errors.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { logger } from "../logger.js";
import { createReminderQueue } from "../services/reminder-queue.js";

/**
 * Cron-triggered reminder dispatch (ARCHITECTURE.md §5).
 *
 * Replaces the always-on sweep. A scheduler calls this every ~15 minutes and one
 * call does one tick: scan every user in their own timezone, enqueue the due
 * reminders under deterministic ids, drain the batch, return the counts.
 *
 * Mounted under /internal, outside the normal auth middleware, because the caller
 * is a machine with a shared secret rather than a signed-in person.
 */
export const cronRouter = Router();

/**
 * Shared-secret auth.
 *
 * Compared in constant time: a naive `===` on a secret leaks its prefix through
 * timing, and this endpoint can be hammered anonymously. The header form matches
 * what Vercel Cron sends (`Authorization: Bearer $CRON_SECRET`), with `x-cron-secret`
 * accepted too so the endpoint can be exercised by hand.
 */
function assertCronSecret(header: string | undefined, alternate: string | undefined): void {
  const expected = env.CRON_SECRET;
  if (expected === undefined || expected === "") {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      503,
      "CRON_SECRET is not configured — refusing to run an unauthenticated dispatch",
    );
  }

  const presented = header?.startsWith("Bearer ") === true ? header.slice(7) : alternate;
  if (presented === undefined || !timingSafeEqual(presented, expected)) {
    throw AppError.unauthorized("Missing or invalid cron secret");
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  // Length is not secret; the comparison below must not short-circuit on content.
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

cronRouter.post(
  "/dispatch-reminders",
  asyncHandler(async (req, res) => {
    assertCronSecret(req.header("authorization"), req.header("x-cron-secret"));

    configureWebPush(env);

    const handle = createReminderQueue();
    try {
      const summary = await dispatchReminders(handle.queue);
      logger.info("cron dispatch", { ...summary });
      res.json({ data: summary });
    } catch (error) {
      /**
       * An unreachable queue is a configuration failure, not a bug in a reminder.
       * Reporting it as 503 tells the caller the dispatch did not run at all —
       * which, given cron retries, is exactly the right thing for it to know.
       */
      logger.error("cron dispatch failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        ERROR_CODES.INTERNAL,
        503,
        "Reminder dispatch could not reach its queue — no reminders were sent",
      );
    } finally {
      // Always closed, even on a throw — a leaked Redis connection outlives the
      // request that made it, and on serverless that is a slow leak with no
      // process restart to clear it.
      await handle.close();
    }
  }),
);
