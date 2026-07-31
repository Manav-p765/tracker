"use client";

/**
 * History data (ARCHITECTURE.md §4).
 *
 * One request per month. The screen needs five series, a heatmap and the moments
 * list together, so batching them is the difference between one round trip and
 * five for a screen that is useless until all of them land.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { DayKey, MonthKey, Pastel } from "@tracker/shared";

import { apiFetch } from "./api";

export type HistorySeriesKey = "habits" | "sleep" | "tasks" | "mood" | "energy";

export interface HeatmapDay {
  date: DayKey;
  done: number;
  total: number;
}

export interface HistoryData {
  month: MonthKey;
  days: DayKey[];
  /** `null` = no data that day. Never zero-filled — the line breaks instead. */
  series: Record<HistorySeriesKey, (number | null)[]>;
  heatmap: HeatmapDay[];
  moments: { date: DayKey; moment: string }[];
  futureFrom: DayKey | null;
}

/**
 * How each series presents itself.
 *
 * `max: null` means "scale to the data" — habits and tasks have no fixed ceiling,
 * while sleep is always 0–24 and the 1–5 scales are always 1–5, so those axes stay
 * put as you move between months and stay comparable.
 */
export const SERIES_META: Record<
  HistorySeriesKey,
  { label: string; pastel: Pastel; min: number; max: number | null; unit: string }
> = {
  habits: { label: "HABITS", pastel: "ochre", min: 0, max: null, unit: "done" },
  sleep: { label: "SLEEP", pastel: "powder", min: 0, max: 24, unit: "hrs" },
  tasks: { label: "TASKS", pastel: "lilac", min: 0, max: null, unit: "done" },
  mood: { label: "MOOD", pastel: "sage", min: 1, max: 5, unit: "" },
  energy: { label: "ENERGY", pastel: "clay", min: 1, max: 5, unit: "" },
};

export const SERIES_ORDER: HistorySeriesKey[] = ["habits", "sleep", "tasks", "mood", "energy"];

export const historyKeys = {
  all: ["history"] as const,
  month: (month: MonthKey) => ["history", month] as const,
};

export const historyApi = {
  month: (month: MonthKey) => apiFetch<HistoryData>(`/history?month=${month}`),
};

export function useHistory(month: MonthKey): UseQueryResult<HistoryData> {
  return useQuery({
    queryKey: historyKeys.month(month),
    queryFn: () => historyApi.month(month),
  });
}

/** True when the month holds nothing at all — drives the calm empty state. */
export function isMonthEmpty(data: HistoryData): boolean {
  const noSeries = SERIES_ORDER.every((key) =>
    data.series[key].every((value) => value === null),
  );
  return noSeries && data.moments.length === 0;
}
