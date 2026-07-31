import { Router } from "express";

import { authRouter } from "./auth.routes.js";
import { checkinRouter } from "./checkin.routes.js";
import { goalRouter } from "./goal.routes.js";
import { habitLogRouter, habitRouter } from "./habit.routes.js";
import { historyRouter } from "./history.routes.js";
import { pushRouter } from "./push.routes.js";

/**
 * The /api surface (ARCHITECTURE.md §4).
 *
 * Still to land with their features:
 *   projects / resources / vault / events → Phase 3
 */
export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/goals", goalRouter);
apiRouter.use("/habits", habitRouter);
apiRouter.use("/habit-logs", habitLogRouter);
apiRouter.use("/checkins", checkinRouter);
apiRouter.use("/history", historyRouter);
apiRouter.use("/push", pushRouter);
