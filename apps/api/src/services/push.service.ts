/**
 * Push subscriptions (ARCHITECTURE.md §8).
 *
 * This module only *stores* subscriptions. Nothing here sends a notification —
 * dispatch is the worker's job (Prompt 2.2).
 *
 * **The dedupe key is the endpoint, not the user.** A push endpoint is issued by
 * the push service to one browser profile on one device, so it is already globally
 * unique; a user with a phone and a laptop legitimately owns two rows. Keying on
 * the user instead would silently drop a device every time you subscribed on
 * another one. The unique index on `endpoint` enforces it.
 */

import type { PushSubscriptionInput } from "@tracker/shared";
import { Types } from "mongoose";

import { AppError } from "../errors.js";
import { PushSubscription } from "@tracker/db";

export interface StoredSubscription {
  endpoint: string;
  createdAt: string;
  userAgent?: string;
}

/**
 * Upsert one device's subscription.
 *
 * Re-subscribing the same browser produces the same endpoint and therefore updates
 * the existing row. Re-assigning `userId` on every write is deliberate: if a second
 * account signs in on a shared device, the endpoint follows whoever subscribed
 * last, which is the only correct answer — the next push to that device would
 * otherwise reach the wrong person.
 */
export async function saveSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<StoredSubscription> {
  const saved = await PushSubscription.findOneAndUpdate(
    { endpoint: input.endpoint },
    {
      $set: {
        userId: new Types.ObjectId(userId),
        keys: input.keys,
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        // A fresh subscription starts with a clean slate.
        failureCount: 0,
        lastFailureAt: null,
      },
      $setOnInsert: { endpoint: input.endpoint },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (saved === null) throw AppError.internal("Could not save the subscription");

  return {
    endpoint: saved.endpoint,
    createdAt: saved.createdAt.toISOString(),
    ...(saved.userAgent === undefined ? {} : { userAgent: saved.userAgent }),
  };
}

/**
 * Forget one device.
 *
 * Scoped by userId so one account cannot delete another's device, and idempotent:
 * removing an endpoint that is already gone is a success, not a 404. The client
 * calls this alongside `subscription.unsubscribe()`, and a half-completed teardown
 * should not leave the UI stuck.
 */
export async function removeSubscription(
  userId: string,
  endpoint: string,
): Promise<{ removed: number }> {
  const result = await PushSubscription.deleteOne({ userId, endpoint });
  return { removed: result.deletedCount };
}

/** Which devices this user has subscribed. Drives the UI's truthful state. */
export async function getStatus(userId: string): Promise<{
  subscribed: boolean;
  deviceCount: number;
  endpoints: string[];
}> {
  const rows = await PushSubscription.find({ userId }).select("endpoint").lean();
  return {
    subscribed: rows.length > 0,
    deviceCount: rows.length,
    endpoints: rows.map((row) => row.endpoint),
  };
}
