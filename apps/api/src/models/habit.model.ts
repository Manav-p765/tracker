import { PASTELS, type Pastel } from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { requiredDayKey, userIdField } from "./shared-fields.js";

/**
 * habits and habitLogs (ARCHITECTURE.md §3).
 *
 * Archiving a habit keeps every log it ever produced — `archivedAt` only removes
 * it from today's grid.
 *
 * habitLogs is the day-keyed collection behind both the X-mark grid and the
 * heatmap. Its unique compound index on { userId, habitId, date } is what makes
 * the write path a single idempotent upsert; un-ticking deletes the row.
 */

export interface HabitDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  pastel: Pastel;
  pixelGlyph: string;
  targetPerWeek?: number;
  sortOrder: number;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const habitSchema = new Schema<HabitDoc>(
  {
    userId: userIdField,
    name: { type: String, required: true, trim: true, maxlength: 60 },
    pastel: { type: String, enum: PASTELS, required: true, default: "sage" },
    pixelGlyph: { type: String, required: true, default: "x", trim: true },
    targetPerWeek: { type: Number, min: 1, max: 7 },
    sortOrder: { type: Number, required: true, default: 0 },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "habits" },
);

habitSchema.index({ userId: 1, archivedAt: 1, sortOrder: 1 });

export type HabitDocument = HydratedDocument<HabitDoc>;
export const Habit: Model<HabitDoc> = model<HabitDoc>("Habit", habitSchema);

export interface HabitLogDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  habitId: Types.ObjectId;
  date: string;
  done: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const habitLogSchema = new Schema<HabitLogDoc>(
  {
    userId: userIdField,
    habitId: { type: Schema.Types.ObjectId, ref: "Habit", required: true },
    date: requiredDayKey,
    done: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "habitLogs" },
);

// One log per habit per day — the guarantee the idempotent upsert relies on.
habitLogSchema.index({ userId: 1, habitId: 1, date: 1 }, { unique: true });
habitLogSchema.index({ userId: 1, date: 1 }); // the grid
habitLogSchema.index({ userId: 1, habitId: 1, date: -1 }); // streaks, heatmap

export type HabitLogDocument = HydratedDocument<HabitLogDoc>;
export const HabitLog: Model<HabitLogDoc> = model<HabitLogDoc>("HabitLog", habitLogSchema);
