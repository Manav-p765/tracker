/**
 * web-push delivery (ARCHITECTURE.md §8, dispatch).
 *
 * Two rules that matter more than the sending itself:
 *
 *  1. **A 404 or 410 means the subscription is permanently gone** — the browser
 *     was uninstalled, the user cleared data, or the push service rotated the
 *     endpoint. Delete the row. Anything else (429, 5xx, network) is transient:
 *     log it, keep the row, let BullMQ retry.
 *  2. **One bad device never stops the others.** Each subscription is sent
 *     independently and its failure is captured, so a user with a dead laptop
 *     subscription still gets the notification on their phone.
 */

import { PushSubscription } from "@tracker/db";
import webpush, { WebPushError } from "web-push";

import { logger } from "../logger.js";

export interface PushPayload {
  title: string;
  body: string;
  /** One tag per reminder kind, so an unread nudge is replaced, not stacked. */
  tag: string;
  url: string;
}

export interface DeliveryResult {
  sent: number;
  /** Endpoints deleted because the push service said they are gone for good. */
  pruned: number;
  /** Transient failures — the row survives and BullMQ will retry the job. */
  failed: number;
}

let configured = false;

/**
 * Configure VAPID once per process.
 *
 * Throws rather than sending unsigned: a misconfigured server that silently fails
 * to deliver is far worse than one that refuses to start the job.
 */
export function configureWebPush(env: {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}): void {
  if (configured) return;

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required to send push");
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT ?? "mailto:tracker@localhost",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  configured = true;
}

/** Exposed so tests can reset between cases. */
export function resetWebPushConfig(): void {
  configured = false;
}

/** A push service response that means "this endpoint is gone, stop trying". */
const isGone = (status: number): boolean => status === 404 || status === 410;

/**
 * Send one payload to every device this user has registered.
 *
 * Returns counts rather than throwing on partial failure — the caller decides
 * whether a job with some transient failures should be retried.
 */
export async function sendToUser(
  userId: string,
  payload: PushPayload,
  send: typeof webpush.sendNotification = webpush.sendNotification.bind(webpush),
): Promise<DeliveryResult> {
  const subscriptions = await PushSubscription.find({ userId }).lean();

  // No devices → nothing to send. Never a push into the void.
  if (subscriptions.length === 0) return { sent: 0, pruned: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    try {
      await send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        body,
      );
      sent += 1;
      await PushSubscription.updateOne(
        { _id: subscription._id },
        { $set: { lastSuccessAt: new Date(), failureCount: 0 } },
      );
    } catch (error) {
      const status = error instanceof WebPushError ? error.statusCode : undefined;

      if (status !== undefined && isGone(status)) {
        // Permanently dead. Removing it keeps the table clean and stops this
        // endpoint failing on every future send.
        await PushSubscription.deleteOne({ _id: subscription._id });
        pruned += 1;
        logger.info("pruned dead push subscription", {
          userId,
          status,
          endpoint: subscription.endpoint,
        });
        continue;
      }

      failed += 1;
      await PushSubscription.updateOne(
        { _id: subscription._id },
        { $set: { lastFailureAt: new Date() }, $inc: { failureCount: 1 } },
      );
      logger.warn("push delivery failed", {
        userId,
        status,
        endpoint: subscription.endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, pruned, failed };
}
