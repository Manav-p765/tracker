import { SCALE_MAX, SCALE_MIN, SLEEP_MAX, SLEEP_MIN } from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { requiredDayKey, userIdField } from "./shared-fields.js";

/**
 * checkins (ARCHITECTURE.md §3) — one document per user per day.
 *
 * The unique index on { userId, date } is the invariant behind the whole ritual:
 * every write is an upsert against it, so logging your mood at lunchtime and the
 * rest at night touch the SAME document and neither can duplicate the day.
 *
 * The write path uses `$set` on explicit paths only — never a whole-document
 * replacement — so a partial save cannot wipe a field it did not mention.
 *
 * Every field except `date` is optional: a partial check-in is a valid check-in.
 * `completed` is the separate signal that the evening flow was actually finished.
 */

export interface CheckinDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  intention?: string;
  mood?: number;
  energy?: number;
  sleepHours?: number;
  moment?: string;
  completedGoalIds: Types.ObjectId[];
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const checkinSchema = new Schema<CheckinDoc>(
  {
    userId: userIdField,
    date: requiredDayKey,
    /** Today's intention, one line (the morning half). */
    intention: { type: String, trim: true, maxlength: 280 },
    /** 1–5 — one value per colour-key square, not a 1–10 range (DESIGN.md §6). */
    mood: { type: Number, min: SCALE_MIN, max: SCALE_MAX },
    energy: { type: Number, min: SCALE_MIN, max: SCALE_MAX },
    /** Hours slept, half-hour steps. The third line on the vitals chart. */
    sleepHours: {
      type: Number,
      min: SLEEP_MIN,
      max: SLEEP_MAX,
      validate: {
        validator: (value: number) => Math.round(value * 2) === value * 2,
        message: "Sleep is logged in half-hour steps",
      },
    },
    moment: { type: String, trim: true, maxlength: 280 },
    completedGoalIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Goal" }],
      default: [],
    },
    completed: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: "checkins" },
);

checkinSchema.index({ userId: 1, date: 1 }, { unique: true });
checkinSchema.index({ userId: 1, date: -1 });

export type CheckinDocument = HydratedDocument<CheckinDoc>;
export const Checkin: Model<CheckinDoc> = model<CheckinDoc>("Checkin", checkinSchema);
