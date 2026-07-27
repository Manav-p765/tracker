import { RECURRENCES, type Recurrence } from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { requiredDayKey, userIdField } from "./shared-fields.js";

/**
 * events (ARCHITECTURE.md §3) — v2.
 *
 * `date` always holds the NEXT (or only) occurrence; the roll-recurring-events job
 * advances it once a recurring date passes and stamps `lastRolledAt` so a second
 * run in the same day cannot skip an occurrence.
 *
 * Named ImportantEvent in the shared types to avoid colliding with the DOM Event.
 */

export interface EventDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  date: string;
  recurring: Recurrence;
  reminderLeadDays: number;
  goalId?: Types.ObjectId | null;
  notes?: string;
  lastRolledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<EventDoc>(
  {
    userId: userIdField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    date: requiredDayKey,
    recurring: { type: String, enum: RECURRENCES, required: true, default: "none" },
    reminderLeadDays: { type: Number, required: true, default: 1, min: 0, max: 365 },
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
    notes: { type: String, trim: true },
    lastRolledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "events" },
);

eventSchema.index({ userId: 1, date: 1 });
eventSchema.index({ userId: 1, recurring: 1, date: 1 });

export type EventDocument = HydratedDocument<EventDoc>;
export const ImportantEvent: Model<EventDoc> = model<EventDoc>("Event", eventSchema);
