import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { corsOrigins } from "./env.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { globalLimiter } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { apiRouter } from "./routes/index.js";

/**
 * The Express app as a factory with no side effects — no listen, no database
 * connection — so tests can mount it against an in-memory Mongo.
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy in production, so rate limiting and `secure` cookies see the
  // real client protocol and address.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (origin === undefined || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(ERROR_CODES.FORBIDDEN, 403, `Origin ${origin} is not allowed`));
      },
      // The refresh cookie must ride along.
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(globalLimiter);

  // Liveness probe: deliberately outside /api and unauthenticated.
  app.get("/healthz", (_req, res) => {
    res.json({ data: { status: "ok", uptimeSeconds: Math.round(process.uptime()) } });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
