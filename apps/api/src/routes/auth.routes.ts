import { loginSchema, registerSchema, updateMeSchema } from "@tracker/shared";
import { Router } from "express";

import * as auth from "../controllers/auth.controller.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { authLimiter, refreshLimiter } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";

/** ARCHITECTURE.md §4 — Auth. */
export const authRouter = Router();

authRouter.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(auth.register),
);

authRouter.post("/login", authLimiter, validate({ body: loginSchema }), asyncHandler(auth.login));

authRouter.post("/refresh", refreshLimiter, asyncHandler(auth.refresh));

authRouter.post("/logout", asyncHandler(auth.logout));

authRouter.get("/me", requireAuth, asyncHandler(auth.me));

authRouter.patch(
  "/me",
  requireAuth,
  validate({ body: updateMeSchema }),
  asyncHandler(auth.patchMe),
);
