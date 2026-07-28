"use client";

/**
 * Keeps this tab's cache in step with writes made anywhere else (ARCHITECTURE.md §6).
 *
 * Every handler **patches** with setQueryData rather than invalidating: the server
 * already sent the whole goal, so a refetch would be a second round trip for
 * information we are holding. That is what makes a tick on the phone appear on a
 * laptop instantly.
 *
 * The socket is notify-only, so nothing here emits.
 */

import { useQueryClient } from "@tanstack/react-query";
import type { GoalWithRollup } from "@tracker/shared";
import { useEffect } from "react";

import { goalKeys, patchGoalInCache, removeGoalFromCache } from "./goals";
import { onSocketEvent } from "./socket";

export function useGoalSocketSync(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const patch = (goal: GoalWithRollup): void => {
      patchGoalInCache(client, goal);
    };

    const unsubscribes = [
      /**
       * A goal created elsewhere. Its parent's ratio changed too, and the payload
       * cannot tell us the parent's new count — that one detail is worth a refetch
       * of the single affected goal.
       */
      onSocketEvent("goal:created", (goal) => {
        patch(goal as GoalWithRollup);
        const parentId = (goal as GoalWithRollup).parentGoalId;
        if (parentId) void client.invalidateQueries({ queryKey: goalKeys.detail(parentId) });
      }),

      onSocketEvent("goal:updated", (goal) => patch(goal as GoalWithRollup)),

      // The server emits goal:updated for the parent straight after this, so the
      // rollup arrives without us asking.
      onSocketEvent("goal:completed", (goal) => patch(goal as GoalWithRollup)),

      onSocketEvent("goal:deleted", ({ id }) => {
        removeGoalFromCache(client, id);
        // Children were detached server-side; their rows have changed shape.
        void client.invalidateQueries({ queryKey: goalKeys.lists() });
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [client, enabled]);
}
