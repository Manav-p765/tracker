/**
 * Push subscription payloads (ARCHITECTURE.md §8).
 *
 * The shape mirrors the browser's `PushSubscription.toJSON()` exactly, so the
 * client can hand it straight over without reshaping — fewer places to get the
 * key names wrong.
 */

import { z } from "zod";

/** URL-safe base64, which is what the Push API emits for both keys. */
const base64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+=*$/, "Expected URL-safe base64");

export const pushSubscriptionSchema = z.object({
  /**
   * The push service URL. Globally unique per device+app install, which is why it
   * — not the user — is the dedupe key.
   */
  endpoint: z.string().url().max(2000),
  keys: z.object({
    /** The client's public key, an uncompressed P-256 point. */
    p256dh: base64UrlSchema.max(200),
    /** The shared auth secret. */
    auth: base64UrlSchema.max(100),
  }),
  /** Optional context, useful when pruning dead devices later. */
  userAgent: z.string().max(500).optional(),
  timezone: z.string().max(100).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

export interface PushStatus {
  /** True when this user has at least one stored subscription. */
  subscribed: boolean;
  /** How many devices are subscribed. */
  deviceCount: number;
  /** True when this browser's own endpoint is among them (set by the client). */
  endpoints: string[];
}
