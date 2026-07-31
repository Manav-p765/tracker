import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { userIdField } from "./shared-fields.js";

/**
 * pushSubscriptions (ARCHITECTURE.md §3).
 *
 * Unique on `endpoint`, so re-subscribing the same device upserts rather than
 * duplicating. One user, many devices.
 *
 * `failureCount` and the timestamps let the dispatcher prune dead devices —
 * a 404/410 from the push service means the subscription is gone (Prompt 2.2).
 */

export interface PushSubscriptionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  timezone?: string;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<PushSubscriptionDoc>(
  {
    userId: userIdField,
    // `unique` builds the { endpoint: 1 } unique index on its own — declaring it
    // again with schema.index() would only earn a duplicate-index warning.
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
    timezone: { type: String },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    failureCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "pushSubscriptions" },
);

export type PushSubscriptionDocument = HydratedDocument<PushSubscriptionDoc>;
export const PushSubscription: Model<PushSubscriptionDoc> = model<PushSubscriptionDoc>(
  "PushSubscription",
  pushSubscriptionSchema,
);
