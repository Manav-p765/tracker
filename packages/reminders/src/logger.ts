/**
 * A logger seam, so this package does not care who hosts it.
 *
 * The reminder domain now runs in two places — the API's cron dispatch and the
 * manual CLI — each with its own Winston setup. Rather than import one app's
 * logger (which the monorepo rule forbids anyway), the host injects its own and
 * the default is silent.
 */

export interface ReminderLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const noop: ReminderLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

let current: ReminderLogger = noop;

export function setReminderLogger(logger: ReminderLogger): void {
  current = logger;
}

export const logger: ReminderLogger = {
  info: (message, meta) => current.info(message, meta),
  warn: (message, meta) => current.warn(message, meta),
  error: (message, meta) => current.error(message, meta),
};
