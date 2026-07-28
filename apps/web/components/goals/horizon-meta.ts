import { HORIZON_PASTEL, HORIZONS, type Horizon, type Pastel } from "@tracker/shared";

/**
 * How a horizon presents itself (DESIGN.md §2).
 *
 * The pastel assignment is FIXED and comes from the shared package, so the API,
 * the tabs, the rows and the progress rules cannot drift apart: daily=sage,
 * weekly=powder, monthly=clay, yearly=ochre, long-term=lilac.
 */
export const HORIZON_LABEL: Readonly<Record<Horizon, string>> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  longterm: "Long term",
};

/** Uppercase form for mono file tags and labels. */
export const HORIZON_TAG: Readonly<Record<Horizon, string>> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
  longterm: "LONG TERM",
};

/** Plural noun for the rollup line: "3/12 monthly done". */
export const HORIZON_NOUN: Readonly<Record<Horizon, string>> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
  longterm: "long-term",
};

export const pastelOf = (horizon: Horizon): Pastel => HORIZON_PASTEL[horizon];

/** A CSS colour for a pastel token. Components never write a hex. */
export const pastelVar = (pastel: Pastel): string => `var(--${pastel})`;

export const isHorizon = (value: string): value is Horizon =>
  (HORIZONS as readonly string[]).includes(value);

export { HORIZONS };
export type { Horizon };
