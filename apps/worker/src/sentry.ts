import * as Sentry from "@sentry/node";

/** No DSN → genuinely no-op, same as the API and web. */
export function initSentry(dsn: string | undefined, environment: string): void {
  if (dsn === undefined || dsn === "") return;
  Sentry.init({ dsn, environment, tracesSampleRate: 0 });
}

export const captureError = (error: unknown, context?: Record<string, unknown>): void => {
  Sentry.captureException(error, context === undefined ? undefined : { extra: context });
};
