/**
 * Auth payload schemas (ARCHITECTURE.md §4).
 *
 * Imported by the API's validate() middleware and by the web login/register
 * forms — one definition, so a rule can never drift between the two.
 */

import { z } from "zod";

import { THEMES } from "../domain/enums.js";
import { timeOfDaySchema, timezoneSchema } from "./common.js";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("Expected an email address");

/**
 * Length over composition rules: a 12-character minimum with no character-class
 * theatre. Capped at 200 because argon2 hashes the whole input.
 */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "That is longer than 200 characters");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
  timezone: timezoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not passwordSchema: an existing password must not be re-validated
  // at login, or a rule change would lock the user out of their own account.
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    timezone: timezoneSchema,
    theme: z.enum(THEMES),
    reminderTime: timeOfDaySchema,
    remindersEnabled: z.boolean(),
    remindCheckin: z.boolean(),
    remindGoals: z.boolean(),
    remindEvents: z.boolean(),
    remindStreak: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
