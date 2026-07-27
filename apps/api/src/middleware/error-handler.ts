import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

import { isProduction } from "../env.js";
import { AppError, ERROR_CODES, isAppError } from "../errors.js";
import { captureException } from "../sentry.js";

/**
 * The single exit for every failure (ARCHITECTURE.md §4, §10).
 *
 * Response shape is always { error: { code, message, details? } }.
 * Only 5xx reaches Sentry — a 401 or a 422 is the system working.
 */

/** Wraps an async handler so a rejected promise reaches this handler (Express 4). */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`No route for ${req.method} ${req.path}`));
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = isAppError(error)
    ? error
    : new AppError(
        ERROR_CODES.INTERNAL,
        500,
        // Never leak an internal message to the client in production.
        isProduction ? "Something went wrong" : errorMessage(error),
      );

  if (appError.status >= 500) {
    req.log?.error("unhandled error", {
      code: appError.code,
      message: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    captureException(error, { requestId: req.id, path: req.originalUrl, method: req.method });
  } else {
    req.log?.warn("request failed", {
      code: appError.code,
      status: appError.status,
      message: appError.message,
    });
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
