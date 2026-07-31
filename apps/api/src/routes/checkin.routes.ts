import {
  checkinDateParamSchema,
  checkinMonthQuerySchema,
  upsertCheckinSchema,
} from "@tracker/shared";
import { Router } from "express";

import * as checkins from "../controllers/checkin.controller.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";

/** ARCHITECTURE.md §4 — Check-ins. Every route is scoped to req.userId. */
export const checkinRouter = Router();

checkinRouter.use(requireAuth);

// One upsert endpoint for the whole ritual: today, a backfilled day, or a
// one-tap mood log all take the same path, so the day can never be duplicated.
checkinRouter.post("/", validate({ body: upsertCheckinSchema }), asyncHandler(checkins.upsert));

// Static before /:date, or "today" would be parsed as a day key.
checkinRouter.get("/today", asyncHandler(checkins.today));

checkinRouter.get("/", validate({ query: checkinMonthQuerySchema }), asyncHandler(checkins.month));

checkinRouter.get(
  "/:date",
  validate({ params: checkinDateParamSchema }),
  asyncHandler(checkins.byDate),
);
