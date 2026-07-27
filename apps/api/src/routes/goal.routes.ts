import {
  completeGoalSchema,
  createGoalSchema,
  goalIdParamSchema,
  listGoalsQuerySchema,
  updateGoalSchema,
} from "@tracker/shared";
import { Router } from "express";

import * as goals from "../controllers/goal.controller.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";

/** ARCHITECTURE.md §4 — Goals. Every route is scoped to req.userId. */
export const goalRouter = Router();

goalRouter.use(requireAuth);

// Before /:id, or "today" would be parsed as an id.
goalRouter.get("/today", asyncHandler(goals.today));

goalRouter.get("/", validate({ query: listGoalsQuerySchema }), asyncHandler(goals.list));

goalRouter.post("/", validate({ body: createGoalSchema }), asyncHandler(goals.create));

goalRouter.get("/:id", validate({ params: goalIdParamSchema }), asyncHandler(goals.detail));

goalRouter.patch(
  "/:id",
  validate({ params: goalIdParamSchema, body: updateGoalSchema }),
  asyncHandler(goals.patch),
);

goalRouter.post(
  "/:id/complete",
  validate({ params: goalIdParamSchema, body: completeGoalSchema }),
  asyncHandler(goals.complete),
);

goalRouter.delete("/:id", validate({ params: goalIdParamSchema }), asyncHandler(goals.remove));
