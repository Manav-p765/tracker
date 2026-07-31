import { checkinMonthQuerySchema } from "@tracker/shared";
import { Router } from "express";

import { asyncHandler } from "../middleware/error-handler.js";
import { currentUserId, requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { getHistory } from "../services/history.service.js";

/**
 * ARCHITECTURE.md §4 — History.
 *
 * One batched read for the whole screen: five per-day series, the heatmap and the
 * moments list. Read-only and read-heavy, so the round trips are worth collapsing.
 */
export const historyRouter = Router();

historyRouter.use(requireAuth);

historyRouter.get(
  "/",
  validate({ query: checkinMonthQuerySchema }),
  asyncHandler(async (req, res) => {
    const { month } = req.query as unknown as { month: string };
    const data = await getHistory(currentUserId(req), month);
    res.json({ data });
  }),
);
