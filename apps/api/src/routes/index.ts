import { Router } from "express";

import { authRouter } from "./auth.routes.js";

/**
 * The /api surface (ARCHITECTURE.md §4).
 *
 * Phase 0 mounts auth. The remaining routers land with their features:
 *   goals      → Prompt 1.1
 *   habits     → Prompt 1.3
 *   checkins   → Prompt 1.4
 *   history    → Prompt 1.5
 *   push       → Prompt 2.1
 *   projects / resources / vault / events → Phase 3
 */
export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
