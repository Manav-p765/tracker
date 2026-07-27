/**
 * The mood / energy colour-key scale (DESIGN.md §6).
 *
 * Mood and energy are stored 1–10 but logged and displayed through five labelled
 * pastel squares. Keeping the band table here means the check-in control, the
 * read-only month legend and the API validator all agree on one mapping.
 */

import type { Pastel } from "./enums.js";

export interface ScaleBand {
  /** Uppercase mono label rendered beneath the square. */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** The value stored when this square is tapped. */
  readonly value: number;
  readonly pastel: Pastel;
}

export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

/** ROUGH → GREAT. Order is the on-screen left-to-right order. */
export const MOOD_BANDS: readonly ScaleBand[] = [
  { label: "ROUGH", min: 1, max: 2, value: 2, pastel: "lilac" },
  { label: "LOW", min: 3, max: 4, value: 4, pastel: "powder" },
  { label: "STEADY", min: 5, max: 6, value: 6, pastel: "ochre" },
  { label: "GOOD", min: 7, max: 8, value: 8, pastel: "sage" },
  { label: "GREAT", min: 9, max: 10, value: 10, pastel: "clay" },
];

/** DRAINED → CHARGED. Identical control, identical pastels, own labels. */
export const ENERGY_BANDS: readonly ScaleBand[] = [
  { label: "DRAINED", min: 1, max: 2, value: 2, pastel: "lilac" },
  { label: "LOW", min: 3, max: 4, value: 4, pastel: "powder" },
  { label: "STEADY", min: 5, max: 6, value: 6, pastel: "ochre" },
  { label: "LIVELY", min: 7, max: 8, value: 8, pastel: "sage" },
  { label: "CHARGED", min: 9, max: 10, value: 10, pastel: "clay" },
];

/** Which band a stored 1–10 value falls in, or undefined if unlogged/out of range. */
export function bandFor(
  bands: readonly ScaleBand[],
  value: number | null | undefined,
): ScaleBand | undefined {
  if (value === null || value === undefined) return undefined;
  return bands.find((band) => value >= band.min && value <= band.max);
}

export function isScaleValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SCALE_MIN &&
    value <= SCALE_MAX
  );
}
