/**
 * Sentry (ARCHITECTURE.md §1). Initialised from day one, and a genuine no-op
 * while SENTRY_DSN is unset — which is all of Phase 0.
 */

import * as Sentry from "@sentry/node";

import { env } from "./env.js";
import { logger } from "./logger.js";

let enabled = false;

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Errors first; performance sampling can wait for real traffic.
    tracesSampleRate: 0,
  });
  enabled = true;
  logger.info("sentry initialised");
}

/** Only ever called for 5xx (see the error handler). */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export const sentryEnabled = (): boolean => enabled;
