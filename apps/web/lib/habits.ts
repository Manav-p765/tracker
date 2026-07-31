"use client";

/**
 * The habits data layer (ARCHITECTURE.md §7).
 *
 * The tick is the most-used interaction in the whole app, so it is optimistic: the
 * X appears on the paper before the request leaves. Everything else follows the
 * same patch-don't-invalidate rule as goals.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CreateHabitInput,
  DayKey,
  Habit,
  HabitGridRow,
  HabitStreak,
  MonthKey,
  Pastel,
  UpdateHabitInput,
} from "@tracker/shared";

import { apiFetch } from "./api";

export interface HeatmapDay {
  date: DayKey;
  done: boolean;
  future: boolean;
}

export interface HabitHeatmapData {
  month: MonthKey;
  habit: Habit;
  days: HeatmapDay[];
  completed: number;
  elapsed: number;
}

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

export const habitKeys = {
  all: ["habits"] as const,
  list: (includeArchived: boolean) => ["habits", "list", includeArchived] as const,
  grid: (from: DayKey, to: DayKey) => ["habits", "grid", from, to] as const,
  streak: (id: string) => ["habits", "streak", id] as const,
  heatmap: (id: string, month: MonthKey) => ["habits", "heatmap", id, month] as const,
};

// ---------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------

export const habitsApi = {
  list: (includeArchived: boolean) =>
    apiFetch<{ habits: Habit[] }>(
      `/habits${includeArchived ? "?includeArchived=true" : ""}`,
    ).then((data) => data.habits),
  create: (input: CreateHabitInput) =>
    apiFetch<{ habit: Habit }>("/habits", { method: "POST", body: input }).then(
      (data) => data.habit,
    ),
  update: (id: string, patch: UpdateHabitInput) =>
    apiFetch<{ habit: Habit }>(`/habits/${id}`, { method: "PATCH", body: patch }).then(
      (data) => data.habit,
    ),
  archive: (id: string, archived: boolean) =>
    apiFetch<{ habit: Habit }>(`/habits/${id}/${archived ? "archive" : "restore"}`, {
      method: "POST",
    }).then((data) => data.habit),
  grid: (from: DayKey, to: DayKey) =>
    apiFetch<{ rows: HabitGridRow[] }>(`/habits/grid?from=${from}&to=${to}`).then(
      (data) => data.rows,
    ),
  streak: (id: string) =>
    apiFetch<{ streak: HabitStreak }>(`/habits/${id}/streak`).then((data) => data.streak),
  heatmap: (id: string, month: MonthKey) =>
    apiFetch<HabitHeatmapData>(`/habits/${id}/heatmap?month=${month}`),
  log: (habitId: string, date: DayKey, done: boolean) =>
    apiFetch<{ log: { habitId: string; date: DayKey; done: boolean } }>("/habit-logs", {
      method: "POST",
      body: { habitId, date, done },
    }).then((data) => data.log),
};

// ---------------------------------------------------------------------------
// cache patching
// ---------------------------------------------------------------------------

/** Writes one tick into every cached grid and heatmap that covers the day. */
export function patchLogInCache(
  client: QueryClient,
  habitId: string,
  date: DayKey,
  done: boolean,
): void {
  for (const entry of client.getQueryCache().findAll({ queryKey: ["habits", "grid"] })) {
    const previous = entry.state.data as HabitGridRow[] | undefined;
    if (previous === undefined) continue;

    client.setQueryData(
      entry.queryKey,
      previous.map((row) => {
        if (row.habit._id !== habitId) return row;
        const days = { ...row.days };
        // An un-ticked day is the ABSENCE of a key, mirroring the server, where
        // done:false deletes the row. Never store `false`.
        if (done) days[date] = true;
        else delete days[date];
        return { ...row, days };
      }),
    );
  }

  for (const entry of client.getQueryCache().findAll({ queryKey: ["habits", "heatmap", habitId] })) {
    const previous = entry.state.data as HabitHeatmapData | undefined;
    if (previous === undefined) continue;
    if (!previous.days.some((day) => day.date === date)) continue;

    const days = previous.days.map((day) => (day.date === date ? { ...day, done } : day));
    client.setQueryData(entry.queryKey, {
      ...previous,
      days,
      completed: days.filter((day) => day.done).length,
    });
  }

  // The streak needs the whole history to recompute, which only the server has.
  void client.invalidateQueries({ queryKey: habitKeys.streak(habitId) });
}

export function patchHabitInCache(client: QueryClient, habit: Habit): void {
  for (const entry of client.getQueryCache().findAll({ queryKey: ["habits", "list"] })) {
    const previous = entry.state.data as Habit[] | undefined;
    if (previous === undefined) continue;

    const includeArchived = entry.queryKey[2] === true;
    const without = previous.filter((cached) => cached._id !== habit._id);
    const belongs = includeArchived || habit.archivedAt === null || habit.archivedAt === undefined;

    client.setQueryData(
      entry.queryKey,
      belongs
        ? [...without, habit].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
          )
        : without,
    );
  }

  // An archived habit leaves the grid; a restored one rejoins it.
  void client.invalidateQueries({ queryKey: ["habits", "grid"] });
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------

export function useHabits(includeArchived = false): UseQueryResult<Habit[]> {
  return useQuery({
    queryKey: habitKeys.list(includeArchived),
    queryFn: () => habitsApi.list(includeArchived),
  });
}

export function useHabitGrid(from: DayKey, to: DayKey): UseQueryResult<HabitGridRow[]> {
  return useQuery({
    queryKey: habitKeys.grid(from, to),
    queryFn: () => habitsApi.grid(from, to),
  });
}

export function useHabitStreak(id: string): UseQueryResult<HabitStreak> {
  return useQuery({
    queryKey: habitKeys.streak(id),
    queryFn: () => habitsApi.streak(id),
  });
}

export function useHabitHeatmap(id: string, month: MonthKey): UseQueryResult<HabitHeatmapData> {
  return useQuery({
    queryKey: habitKeys.heatmap(id, month),
    queryFn: () => habitsApi.heatmap(id, month),
  });
}

/**
 * Tick or un-tick a day.
 *
 * Optimistic, and safe to fire repeatedly: the server's write is a single upsert on
 * a unique index, so a double tap cannot produce two rows.
 */
export function useToggleHabitLog(): UseMutationResult<
  { habitId: string; date: DayKey; done: boolean },
  Error,
  { habitId: string; date: DayKey; done: boolean },
  { snapshot: [readonly unknown[], unknown][] }
> {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ habitId, date, done }) => habitsApi.log(habitId, date, done),

    onMutate: ({ habitId, date, done }) => {
      const snapshot = client.getQueriesData({ queryKey: habitKeys.all });
      patchLogInCache(client, habitId, date, done);
      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      // Put the paper back as it was rather than leaving a mark that never saved.
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
    },

    onSuccess: ({ habitId, date, done }) => patchLogInCache(client, habitId, date, done),
  });
}

export function useCreateHabit(): UseMutationResult<Habit, Error, CreateHabitInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: habitsApi.create,
    onSuccess: (habit) => patchHabitInCache(client, habit),
  });
}

export function useUpdateHabit(): UseMutationResult<
  Habit,
  Error,
  { id: string; patch: UpdateHabitInput }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => habitsApi.update(id, patch),
    onSuccess: (habit) => patchHabitInCache(client, habit),
  });
}

export function useArchiveHabit(): UseMutationResult<
  Habit,
  Error,
  { id: string; archived: boolean }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }) => habitsApi.archive(id, archived),
    onSuccess: (habit) => patchHabitInCache(client, habit),
  });
}

export type { Habit, HabitGridRow, HabitStreak, Pastel };
