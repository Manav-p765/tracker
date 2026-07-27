import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { requiredDayKey, userIdField } from "./shared-fields.js";

/**
 * checkins (ARCHITECTURE.md §3) — one document per user per day.
 *
 * The unique index on { userId, date } is the invariant behind the whole ritual:
 * morning and evening patch the SAME document, so the write path must always be
 * `$set` on explicit paths (never a whole-document replacement) and saving one
 * half can never wipe the other. Prompt 1.4 builds that write path.
 *
 * Every field except `date` is optional — a partial check-in is a valid check-in.
 */

export interface CheckinDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  intention: string[];
  mood?: number;
  energy?: number;
  sleep?: number;
  moment?: string;
  completed: Types.ObjectId[];
  morningLoggedAt?: Date | null;
  eveningLoggedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const checkinSchema = new Schema<CheckinDoc>(
  {
    userId: userIdField,
    date: requiredDayKey,
    intention: {
      type: [String],
      default: [],
      validate: {
        validator: (lines: string[]) => lines.length <= 5,
        message: "At most five intention lines",
      },
    },
    mood: { type: Number, min: 1, max: 10 },
    energy: { type: Number, min: 1, max: 10 },
    // Hours slept. The third line on the vitals chart.
    sleep: { type: Number, min: 0, max: 24 },
    moment: { type: String, trim: true, maxlength: 280 },
    completed: { type: [{ type: Schema.Types.ObjectId, ref: "Goal" }], default: [] },
    morningLoggedAt: { type: Date, default: null },
    eveningLoggedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "checkins" },
);

checkinSchema.index({ userId: 1, date: 1 }, { unique: true });
checkinSchema.index({ userId: 1, date: -1 });

export type CheckinDocument = HydratedDocument<CheckinDoc>;
export const Checkin: Model<CheckinDoc> = model<CheckinDoc>("Checkin", checkinSchema);
