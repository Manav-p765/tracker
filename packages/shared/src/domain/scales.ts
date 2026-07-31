/**
 * The mood / energy colour-key scale (DESIGN.md §6).
 *
 * **Five bands, stored 1–5 — one value per square.** An earlier revision stored
 * 1–10 with each band spanning two values, which bought nothing: the UI only ever
 * offers five squares, so the odd values were unreachable and the extra range was
 * a lie about how precise the data is. The band IS the value.
 */

import type { Pastel } from "./enums.js";

export interface ScaleBand {
  /** Uppercase mono label rendered beneath the square. */
  readonly label: string;
  /** The stored value, 1–5. */
  readonly value: number;
  readonly pastel: Pastel;
}

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** ROUGH → GREAT. Order is the on-screen left-to-right order. */
export const MOOD_BANDS: readonly ScaleBand[] = [
  { label: "ROUGH", value: 1, pastel: "lilac" },
  { label: "LOW", value: 2, pastel: "powder" },
  { label: "STEADY", value: 3, pastel: "ochre" },
  { label: "GOOD", value: 4, pastel: "sage" },
  { label: "GREAT", value: 5, pastel: "clay" },
];

/** DRAINED → CHARGED. Identical control, identical pastels, own labels. */
export const ENERGY_BANDS: readonly ScaleBand[] = [
  { label: "DRAINED", value: 1, pastel: "lilac" },
  { label: "LOW", value: 2, pastel: "powder" },
  { label: "STEADY", value: 3, pastel: "ochre" },
  { label: "LIVELY", value: 4, pastel: "sage" },
  { label: "CHARGED", value: 5, pastel: "clay" },
];

/** Which band a stored value names, or undefined if unlogged / out of range. */
export function bandFor(
  bands: readonly ScaleBand[],
  value: number | null | undefined,
): ScaleBand | undefined {
  if (value === null || value === undefined) return undefined;
  return bands.find((band) => band.value === value);
}

export function isScaleValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SCALE_MIN &&
    value <= SCALE_MAX
  );
}

/** Sleep is hours, logged in half-hour steps. */
export const SLEEP_MIN = 0;
export const SLEEP_MAX = 24;
export const SLEEP_STEP = 0.5;

export function isSleepHours(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= SLEEP_MIN &&
    value <= SLEEP_MAX &&
    // One decimal place, on the half hour.
    Math.round(value * 2) === value * 2
  );
}
