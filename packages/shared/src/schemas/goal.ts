/**
 * Goal payload schemas (SCOPE.md §2, ARCHITECTURE.md §4).
 *
 * Note what is NOT here: `status` is not settable through create or patch, and
 * `completedDate` is never client-supplied. Completion goes through
 * POST /goals/:id/complete so there is one code path that stamps the date in the
 * user's own timezone — and the check-in screen (Prompt 1.4) reuses it.
 */

import { z } from "zod";

import { DIFFICULTIES, GOAL_STATUS_VIEWS, HORIZONS } from "../domain/enums.js";
import { dayKeySchema, objectIdSchema } from "./common.js";

export const goalIdParamSchema = z.object({ id: objectIdSchema });

export const createGoalSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a title").max(200),
  notes: z.string().trim().max(4000).optional(),
  horizon: z.enum(HORIZONS),
  /** null clears it; undefined leaves it alone. */
  parentGoalId: objectIdSchema.nullable().optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  targetValue: z.number().int().min(1).max(1_000_000).optional(),
  currentValue: z.number().int().min(0).max(1_000_000).optional(),
  dueDate: dayKeySchema.optional(),
  sortOrder: z.number().int().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(4000).nullable(),
    horizon: z.enum(HORIZONS),
    parentGoalId: objectIdSchema.nullable(),
    difficulty: z.enum(DIFFICULTIES).nullable(),
    targetValue: z.number().int().min(1).max(1_000_000).nullable(),
    currentValue: z.number().int().min(0).max(1_000_000),
    dueDate: dayKeySchema.nullable(),
    sortOrder: z.number().int(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const completeGoalSchema = z.object({ completed: z.boolean() });
export type CompleteGoalInput = z.infer<typeof completeGoalSchema>;

export const listGoalsQuerySchema = z.object({
  horizon: z.enum(HORIZONS).optional(),
  /** `overdue` is derived, not stored — the service resolves it (SCOPE.md §2). */
  status: z.enum(GOAL_STATUS_VIEWS).optional(),
  /** "none" asks for top-level goals only; an id asks for that goal's children. */
  parentGoalId: z.union([objectIdSchema, z.literal("none")]).optional(),
});
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
