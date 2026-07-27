"use client";

/**
 * Sentry from day one (ARCHITECTURE.md §1) — and a genuine no-op when
 * NEXT_PUBLIC_SENTRY_DSN is unset, which is the whole of Phase 0.
 *
 * Deliberately initialised from a mounted component rather than through
 * withSentryConfig: no build-time network access, no source-map upload step, and
 * nothing to unpick when the DSN is empty.
 */

import { useEffect } from "react";

export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        // Errors matter here; performance sampling can wait for real traffic.
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
      });
    });
  }, []);

  return null;
}
