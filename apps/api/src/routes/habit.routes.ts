import {
  createHabitSchema,
  habitGridQuerySchema,
  habitIdParamSchema,
  habitLogSchema,
  habitMonthQuerySchema,
  listHabitsQuerySchema,
  updateHabitSchema,
} from "@tracker/shared";
import { Router } from "express";

import * as habits from "../controllers/habit.controller.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";

/** ARCHITECTURE.md §4 — Habits. Every route is scoped to req.userId. */
export const habitRouter = Router();

habitRouter.use(requireAuth);

// Static paths before /:id, or "grid" would be read as an id.
habitRouter.get("/grid", validate({ query: habitGridQuerySchema }), asyncHandler(habits.grid));

habitRouter.get("/", validate({ query: listHabitsQuerySchema }), asyncHandler(habits.list));
habitRouter.post("/", validate({ body: createHabitSchema }), asyncHandler(habits.create));

habitRouter.patch(
  "/:id",
  validate({ params: habitIdParamSchema, body: updateHabitSchema }),
  asyncHandler(habits.patch),
);

habitRouter.post(
  "/:id/archive",
  validate({ params: habitIdParamSchema }),
  asyncHandler(habits.archive),
);

habitRouter.post(
  "/:id/restore",
  validate({ params: habitIdParamSchema }),
  asyncHandler(habits.restore),
);

habitRouter.get(
  "/:id/heatmap",
  validate({ params: habitIdParamSchema, query: habitMonthQuerySchema }),
  asyncHandler(habits.heatmap),
);

habitRouter.get(
  "/:id/streak",
  validate({ params: habitIdParamSchema }),
  asyncHandler(habits.streak),
);

/**
 * Logs live at their own top-level path, matching ARCHITECTURE.md §4:
 * POST /habit-logs { habitId, date, done }.
 */
export const habitLogRouter = Router();

habitLogRouter.use(requireAuth);
habitLogRouter.post("/", validate({ body: habitLogSchema }), asyncHandler(habits.log));
