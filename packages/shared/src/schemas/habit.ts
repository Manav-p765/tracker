/**
 * Habit payload schemas (SCOPE.md §4.2, ARCHITECTURE.md §4).
 *
 * `archivedAt` is not settable through patch — archiving goes through
 * POST /habits/:id/archive so there is one path that keeps the history and only
 * drops the habit from today's grid.
 */

import { z } from "zod";

import { PASTELS } from "../domain/enums.js";
import { dayKeySchema, monthKeySchema, objectIdSchema } from "./common.js";

/** Glyph keys the pixel set knows about (DESIGN.md §7). */
export const HABIT_GLYPHS = ["x", "book", "drop", "shoe"] as const;
export type HabitGlyph = (typeof HABIT_GLYPHS)[number];

export const habitIdParamSchema = z.object({ id: objectIdSchema });

export const createHabitSchema = z.object({
  name: z.string().trim().min(1, "Give the habit a name").max(60),
  pastel: z.enum(PASTELS).optional(),
  pixelGlyph: z.enum(HABIT_GLYPHS).optional(),
  targetPerWeek: z.number().int().min(1).max(7).optional(),
  sortOrder: z.number().int().optional(),
});
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    pastel: z.enum(PASTELS),
    pixelGlyph: z.enum(HABIT_GLYPHS),
    targetPerWeek: z.number().int().min(1).max(7).nullable(),
    sortOrder: z.number().int(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export const listHabitsQuerySchema = z.object({
  /** Query strings are text, so accept the string form of the flag. */
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type ListHabitsQuery = z.infer<typeof listHabitsQuerySchema>;

export const habitGridQuerySchema = z
  .object({ from: dayKeySchema, to: dayKeySchema })
  .refine((value) => value.from <= value.to, {
    message: "`from` must not be after `to`",
    path: ["from"],
  });
export type HabitGridQuery = z.infer<typeof habitGridQuerySchema>;

export const habitMonthQuerySchema = z.object({ month: monthKeySchema });
export type HabitMonthQuery = z.infer<typeof habitMonthQuerySchema>;

/**
 * One tick. `done: false` deletes the row rather than storing a negative — an
 * un-ticked day is the absence of a log, which is what keeps the grid honest.
 */
export const habitLogSchema = z.object({
  habitId: objectIdSchema,
  date: dayKeySchema,
  done: z.boolean(),
});
export type HabitLogInput = z.infer<typeof habitLogSchema>;
