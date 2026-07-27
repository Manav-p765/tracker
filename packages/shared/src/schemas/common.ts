/**
 * Shared Zod primitives (ARCHITECTURE.md §10).
 *
 * Every API payload is validated at the route edge with a schema from this
 * package, so the client and the server can never disagree about a shape.
 */

import { z } from "zod";

import { isDayKey, isMonthKey } from "../date/day-key.js";

/** A Mongo ObjectId in hex form. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Expected a 24-character ObjectId");

/** "YYYY-MM-DD", validated as a real calendar day. */
export const dayKeySchema = z.string().refine(isDayKey, {
  message: 'Expected a "YYYY-MM-DD" calendar day',
});

/** "YYYY-MM". */
export const monthKeySchema = z.string().refine(isMonthKey, {
  message: 'Expected a "YYYY-MM" month',
});

/** "HH:mm", 24-hour. The user's reminder time, in their own timezone. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour "HH:mm" time');

/**
 * An IANA timezone in Region/City form.
 *
 * Two checks, both load-bearing, because every day key the user owns is derived
 * from this field:
 *
 *  1. ICU must know it — catches typos outright.
 *  2. It must be Region/City (or literally "UTC"). ICU *accepts* bare
 *     abbreviations and resolves them silently: "IST" becomes Asia/Calcutta even
 *     though the user may have meant Israel or Ireland, which would shift every
 *     date they log. Abbreviations are ambiguous, so they are rejected outright.
 */
export const timezoneSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unknown timezone — expected an IANA name like Asia/Kolkata",
      });
      return;
    }
    if (value !== "UTC" && !value.includes("/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Ambiguous timezone "${value}" — use the Region/City form, e.g. Asia/Kolkata`,
      });
    }
  });

/** 1–10, the stored mood / energy scale. */
export const scaleValueSchema = z.number().int().min(1).max(10);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
