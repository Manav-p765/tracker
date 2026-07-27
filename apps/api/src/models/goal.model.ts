import {
  DIFFICULTIES,
  GOAL_STATUSES,
  HORIZONS,
  type Difficulty,
  type GoalStatus,
  type Horizon,
} from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { optionalDayKey, userIdField } from "./shared-fields.js";

/**
 * goals (ARCHITECTURE.md §3).
 *
 * `status` is stored; **overdue is derived** (`status === "active" && dueDate <
 * today(user.timezone)`) and never written. Rollup counts are likewise computed
 * on read. Horizon ordering and acyclicity are enforced in the service layer —
 * Prompt 1.1 — because both need to read other documents.
 */

export interface GoalDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  notes?: string;
  horizon: Horizon;
  parentGoalId?: Types.ObjectId | null;
  difficulty?: Difficulty;
  targetValue?: number;
  currentValue: number;
  status: GoalStatus;
  dueDate?: string;
  completedDate?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<GoalDoc>(
  {
    userId: userIdField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true },
    horizon: { type: String, enum: HORIZONS, required: true },
    parentGoalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
    difficulty: { type: String, enum: DIFFICULTIES },
    targetValue: { type: Number, min: 0 },
    currentValue: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: GOAL_STATUSES, required: true, default: "active" },
    dueDate: optionalDayKey,
    completedDate: optionalDayKey,
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "goals" },
);

goalSchema.index({ userId: 1, horizon: 1, status: 1 });
goalSchema.index({ userId: 1, parentGoalId: 1 });
goalSchema.index({ userId: 1, dueDate: 1 });

/**
 * The one invariant cheap enough to guard at the document level: a goal cannot be
 * its own parent. The full ancestor walk lives in the service (Prompt 1.1) since
 * it needs database reads.
 */
goalSchema.pre("save", function guardSelfParent(next) {
  if (this.parentGoalId && this.parentGoalId.equals(this._id)) {
    next(new Error("A goal cannot be its own parent"));
    return;
  }
  next();
});

export type GoalDocument = HydratedDocument<GoalDoc>;
export const Goal: Model<GoalDoc> = model<GoalDoc>("Goal", goalSchema);
