import { Router } from "express";

import { authRouter } from "./auth.routes.js";
import { goalRouter } from "./goal.routes.js";

/**
 * The /api surface (ARCHITECTURE.md §4).
 *
 * Still to land with their features:
 *   habits     → Prompt 1.3
 *   checkins   → Prompt 1.4
 *   history    → Prompt 1.5
 *   push       → Prompt 2.1
 *   projects / resources / vault / events → Phase 3
 */
export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/goals", goalRouter);
