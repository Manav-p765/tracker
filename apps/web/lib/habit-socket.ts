"use client";

/**
 * Keeps habits in step with writes made on another device (ARCHITECTURE.md §6).
 *
 * Same rule as goals: patch with setQueryData, never blanket-invalidate. Ticking
 * on the phone fills the cell on the laptop without a refetch.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { patchHabitInCache, patchLogInCache } from "./habits";
import { onSocketEvent } from "./socket";

export function useHabitSocketSync(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const unsubscribes = [
      onSocketEvent("habit:created", (habit) => patchHabitInCache(client, habit)),
      onSocketEvent("habit:updated", (habit) => patchHabitInCache(client, habit)),
      onSocketEvent("habit:archived", (habit) => patchHabitInCache(client, habit)),
      onSocketEvent("habitLog:changed", ({ habitId, date, done }) => {
        patchLogInCache(client, habitId, date, done);
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [client, enabled]);
}
