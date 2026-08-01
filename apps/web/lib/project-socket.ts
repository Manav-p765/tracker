"use client";

/**
 * Keeps projects in step with writes made on another device (ARCHITECTURE.md §6).
 *
 * `project:changed` carries the whole folder including its derived progress, so it
 * patches in place. Milestone and resource events carry only the project id — the
 * detail is a composite of three collections, and re-reading the one affected
 * project is cheaper to reason about than reconstructing it from a diff.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { patchProjectInCache, projectKeys, removeProjectFromCache } from "./projects";
import { onSocketEvent } from "./socket";

export function useProjectSocketSync(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const unsubscribes = [
      onSocketEvent("project:changed", ({ projectId, project }) => {
        // A null project means it was deleted somewhere else.
        if (project === null) removeProjectFromCache(client, projectId);
        else patchProjectInCache(client, project);
      }),

      onSocketEvent("milestone:changed", ({ projectId }) => {
        void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      }),

      onSocketEvent("resource:changed", ({ projectId }) => {
        if (projectId === null) return;
        void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [client, enabled]);
}
