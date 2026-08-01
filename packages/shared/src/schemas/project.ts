/**
 * Learning project payloads (SCOPE.md §4.3, ARCHITECTURE.md §3).
 *
 * `progress` is absent on purpose — it is derived from the milestones on every
 * read and can never be set by a client.
 */

import { z } from "zod";

import { PASTELS, PROJECT_STATUSES } from "../domain/enums.js";
import { dayKeySchema, objectIdSchema } from "./common.js";

export const projectIdParamSchema = z.object({ id: objectIdSchema });

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Give the project a title").max(200),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  /** Omitted → assigned round-robin, so a stack of folders is never all one colour. */
  pastel: z.enum(PASTELS).optional(),
  targetDate: dayKeySchema.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullable(),
    status: z.enum(PROJECT_STATUSES),
    pastel: z.enum(PASTELS),
    targetDate: dayKeySchema.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

// ---------------------------------------------------------------------------
// milestones
// ---------------------------------------------------------------------------

export const milestoneIdParamSchema = z.object({ id: objectIdSchema });

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, "Give the milestone a title").max(200),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    /** Ticking stamps today's date in the user's timezone, server-side. */
    done: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

/** The whole ordered list, so a reorder is one atomic intent rather than N swaps. */
export const reorderMilestonesSchema = z.object({
  milestoneIds: z.array(objectIdSchema).min(1).max(200),
});
export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesSchema>;

// ---------------------------------------------------------------------------
// project resources
// ---------------------------------------------------------------------------

/**
 * A pasted URL almost always arrives with whitespace around it, and rejecting
 * that is the kind of pedantry that makes an app feel hostile. Trim first, then
 * validate — and only validate when something was actually given.
 */
const urlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === "" || z.string().url().safeParse(value).success, {
    message: "That doesn't look like a link — it should start with http:// or https://",
  });

export const createResourceSchema = z.object({
  title: z.string().trim().min(1, "Give the resource a title").max(300),
  url: urlSchema.optional(),
  summary: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: urlSchema.nullable(),
    summary: z.string().trim().max(4000).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const resourceIdParamSchema = z.object({ id: objectIdSchema });
