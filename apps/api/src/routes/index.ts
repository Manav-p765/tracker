import { Router } from "express";

import { authRouter } from "./auth.routes.js";
import { checkinRouter } from "./checkin.routes.js";
import { cronRouter } from "./cron.routes.js";
import { goalRouter } from "./goal.routes.js";
import { habitLogRouter, habitRouter } from "./habit.routes.js";
import { historyRouter } from "./history.routes.js";
import { milestoneRouter, projectRouter, resourceRouter } from "./project.routes.js";
import { pushRouter } from "./push.routes.js";

/**
 * The /api surface (ARCHITECTURE.md §4).
 *
 * Still to land with their features:
 *   vault / events → Phase 3.2, 3.3
 */
export const apiRouter = Router();

// Machine-to-machine, shared-secret auth — not part of the signed-in surface.
apiRouter.use("/internal/cron", cronRouter);

apiRouter.use("/auth", authRouter);
apiRouter.use("/goals", goalRouter);
apiRouter.use("/habits", habitRouter);
apiRouter.use("/habit-logs", habitLogRouter);
apiRouter.use("/checkins", checkinRouter);
apiRouter.use("/history", historyRouter);
apiRouter.use("/push", pushRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/milestones", milestoneRouter);
apiRouter.use("/resources", resourceRouter);
