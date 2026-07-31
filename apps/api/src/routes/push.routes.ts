import { pushSubscriptionSchema, pushUnsubscribeSchema } from "@tracker/shared";
import { Router } from "express";

import { env } from "../env.js";
import { AppError, ERROR_CODES } from "../errors.js";
import { asyncHandler } from "../middleware/error-handler.js";
import { currentUserId, requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import { getStatus, removeSubscription, saveSubscription } from "../services/push.service.js";

/**
 * ARCHITECTURE.md §8 — push subscriptions.
 *
 * Storage only. Sending lives in the worker (Prompt 2.2), so there is no /push/test
 * here yet: a button that claims to send and cannot would be worse than no button.
 */
export const pushRouter = Router();

/**
 * The VAPID **public** key, served rather than baked into the web bundle.
 *
 * Public by design — it is the applicationServerKey every subscriber needs. Serving
 * it means regenerating the keypair does not require rebuilding and redeploying the
 * web app, which is exactly the kind of mismatch that produces subscriptions the
 * server can never push to. The private key never leaves this process.
 *
 * Unauthenticated: it is public information, and the client needs it before the
 * subscribe call.
 */
pushRouter.get(
  "/vapid-public-key",
  asyncHandler(async (_req, res) => {
    if (env.VAPID_PUBLIC_KEY === undefined || env.VAPID_PUBLIC_KEY === "") {
      throw new AppError(
        ERROR_CODES.INTERNAL,
        503,
        "Push is not configured on this server — no VAPID key",
      );
    }
    res.json({ data: { publicKey: env.VAPID_PUBLIC_KEY } });
  }),
);

pushRouter.use(requireAuth);

pushRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    res.json({ data: await getStatus(currentUserId(req)) });
  }),
);

pushRouter.post(
  "/subscribe",
  validate({ body: pushSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const data = await saveSubscription(currentUserId(req), req.body);
    res.status(201).json({ data: { subscription: data } });
  }),
);

pushRouter.delete(
  "/subscribe",
  validate({ body: pushUnsubscribeSchema }),
  asyncHandler(async (req, res) => {
    const data = await removeSubscription(currentUserId(req), req.body.endpoint);
    res.json({ data });
  }),
);
