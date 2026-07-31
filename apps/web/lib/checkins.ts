"use client";

/**
 * The check-in data layer (ARCHITECTURE.md §7).
 *
 * One endpoint does the whole ritual: the evening sheet's single Done, a one-tap
 * mood log from the home card, and a backfilled day all POST to /checkins. That is
 * deliberate — one write path means one place where the day can be duplicated, and
 * the unique index means it cannot be.
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
  Checkin,
  CheckinOrEmpty,
  DayKey,
  MonthKey,
  UpsertCheckinInput,
} from "@tracker/shared";

import { apiFetch } from "./api";
import { goalKeys } from "./goals";

export const checkinKeys = {
  all: ["checkins"] as const,
  today: () => ["checkins", "today"] as const,
  day: (date: DayKey) => ["checkins", "day", date] as const,
  month: (month: MonthKey) => ["checkins", "month", month] as const,
};

export const checkinsApi = {
  today: () =>
    apiFetch<{ checkin: CheckinOrEmpty }>("/checkins/today").then((data) => data.checkin),
  byDate: (date: DayKey) =>
    apiFetch<{ checkin: CheckinOrEmpty }>(`/checkins/${date}`).then((data) => data.checkin),
  month: (month: MonthKey) =>
    apiFetch<{ checkins: Checkin[] }>(`/checkins?month=${month}`).then((data) => data.checkins),
  upsert: (input: UpsertCheckinInput) =>
    apiFetch<{ checkin: Checkin }>("/checkins", { method: "POST", body: input }).then(
      (data) => data.checkin,
    ),
};

/**
 * Writes one check-in into every cache that holds that day.
 *
 * Idempotent by construction: entries are replaced by date, never appended, so the
 * mutation's own result and the socket echo of the same write converge instead of
 * doubling up.
 */
export function patchCheckinInCache(client: QueryClient, checkin: Checkin): void {
  const withExists = { ...checkin, exists: true as const };

  client.setQueryData<CheckinOrEmpty>(checkinKeys.day(checkin.date), withExists);

  // `today` only holds this document if it IS today.
  client.setQueryData<CheckinOrEmpty>(checkinKeys.today(), (previous) =>
    previous !== undefined && previous.date === checkin.date ? withExists : previous,
  );

  const month = checkin.date.slice(0, 7);
  client.setQueryData<Checkin[]>(checkinKeys.month(month), (previous) => {
    if (previous === undefined) return previous;
    const without = previous.filter((entry) => entry.date !== checkin.date);
    return [...without, checkin].sort((a, b) => a.date.localeCompare(b.date));
  });
}

export function useTodayCheckin(): UseQueryResult<CheckinOrEmpty> {
  return useQuery({
    queryKey: checkinKeys.today(),
    queryFn: checkinsApi.today,
  });
}

export function useCheckin(date: DayKey): UseQueryResult<CheckinOrEmpty> {
  return useQuery({
    queryKey: checkinKeys.day(date),
    queryFn: () => checkinsApi.byDate(date),
  });
}

export function useMonthCheckins(month: MonthKey): UseQueryResult<Checkin[]> {
  return useQuery({
    queryKey: checkinKeys.month(month),
    queryFn: () => checkinsApi.month(month),
  });
}

/**
 * The single write.
 *
 * Optimistic, because a mood tap has to feel like ink: the square fills before the
 * request leaves. On failure the previous cache is restored — and the sheet keeps
 * its own local form state, so nothing the user typed is lost either way.
 */
export function useUpsertCheckin(): UseMutationResult<
  Checkin,
  Error,
  UpsertCheckinInput,
  { snapshot: [readonly unknown[], unknown][] }
> {
  const client = useQueryClient();

  return useMutation({
    mutationFn: checkinsApi.upsert,

    onMutate: (input) => {
      const snapshot = client.getQueriesData({ queryKey: checkinKeys.all });

      const current = client.getQueryData<CheckinOrEmpty>(
        input.date === undefined ? checkinKeys.today() : checkinKeys.day(input.date),
      );

      // Only patch optimistically when the day is already in cache; inventing a
      // document here would mean guessing _id and timestamps.
      if (current !== undefined && current.exists) {
        const optimistic: Checkin = { ...current };
        for (const key of ["intention", "mood", "energy", "sleepHours", "moment"] as const) {
          const value = input[key];
          if (value === undefined) continue;
          if (value === null) delete optimistic[key];
          else Object.assign(optimistic, { [key]: value });
        }
        if (input.completed !== undefined) optimistic.completed = input.completed;
        if (input.completedGoalIds !== undefined) {
          optimistic.completedGoalIds = input.completedGoalIds;
        }
        patchCheckinInCache(client, optimistic);
      }

      return { snapshot };
    },

    onError: (_error, _input, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
    },

    onSuccess: (checkin, input) => {
      patchCheckinInCache(client, checkin);
      // Ticking goals through the check-in completes them server-side, so the
      // goal caches are now stale in a way only the server can settle.
      if (input.completedGoalIds !== undefined && input.completedGoalIds.length > 0) {
        void client.invalidateQueries({ queryKey: goalKeys.all });
      }
    },
  });
}

export type { Checkin, CheckinOrEmpty };
