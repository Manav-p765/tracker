"use client";

/**
 * The goals data layer (ARCHITECTURE.md §7).
 *
 * All server state lives in TanStack Query. Two rules from the docs shape this
 * file:
 *
 *  1. **Optimistic checkoff.** Ticking a goal must feel like putting ink on paper,
 *     so the cache is patched before the request leaves.
 *  2. **Patch, never invalidate.** Socket events and mutation results are written
 *     into the cache with setQueryData, so a write on the phone updates a laptop
 *     tab without a refetch (ARCHITECTURE.md §6).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { HORIZON_RANK } from "@tracker/shared";
import type {
  CreateGoalInput,
  Goal,
  GoalDetail,
  GoalStatusView,
  GoalWithRollup,
  Horizon,
  ListGoalsQuery,
  UpdateGoalInput,
} from "@tracker/shared";

import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

export const goalKeys = {
  all: ["goals"] as const,
  lists: () => ["goals", "list"] as const,
  list: (query: ListGoalsQuery) => ["goals", "list", query] as const,
  today: () => ["goals", "today"] as const,
  detail: (id: string) => ["goals", "detail", id] as const,
};

// ---------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------

const toSearch = (query: ListGoalsQuery): string => {
  const params = new URLSearchParams();
  if (query.horizon !== undefined) params.set("horizon", query.horizon);
  if (query.status !== undefined) params.set("status", query.status);
  if (query.parentGoalId !== undefined) params.set("parentGoalId", query.parentGoalId);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
};

export const goalsApi = {
  list: (query: ListGoalsQuery) =>
    apiFetch<{ goals: GoalWithRollup[] }>(`/goals${toSearch(query)}`).then((data) => data.goals),
  today: () => apiFetch<{ goals: GoalWithRollup[] }>("/goals/today").then((data) => data.goals),
  detail: (id: string) =>
    apiFetch<{ goal: GoalDetail }>(`/goals/${id}`).then((data) => data.goal),
  create: (input: CreateGoalInput) =>
    apiFetch<{ goal: GoalWithRollup }>("/goals", { method: "POST", body: input }).then(
      (data) => data.goal,
    ),
  update: (id: string, patch: UpdateGoalInput) =>
    apiFetch<{ goal: GoalWithRollup }>(`/goals/${id}`, { method: "PATCH", body: patch }).then(
      (data) => data.goal,
    ),
  complete: (id: string, completed: boolean) =>
    apiFetch<{ goal: GoalWithRollup }>(`/goals/${id}/complete`, {
      method: "POST",
      body: { completed },
    }).then((data) => data.goal),
  remove: (id: string) =>
    apiFetch<{ detached: number }>(`/goals/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// cache patching
// ---------------------------------------------------------------------------

/**
 * Which status bucket a goal falls in, derived exactly as the server does
 * (SCOPE.md §2). Needed client-side so a patched goal can be dropped from a list
 * it no longer belongs to — tick an overdue goal and it must leave the overdue
 * tab, not linger until the next refetch.
 */
export function statusViewOf(goal: GoalWithRollup): GoalStatusView | null {
  if (goal.status === "done") return "done";
  if (goal.status === "archived") return null;
  return goal.isOverdue ? "overdue" : "active";
}

function matchesQuery(goal: GoalWithRollup, query: ListGoalsQuery): boolean {
  if (query.horizon !== undefined && goal.horizon !== query.horizon) return false;
  if (query.status !== undefined && statusViewOf(goal) !== query.status) return false;
  if (query.parentGoalId === "none" && goal.parentGoalId !== null) return false;
  if (
    query.parentGoalId !== undefined &&
    query.parentGoalId !== "none" &&
    goal.parentGoalId !== query.parentGoalId
  ) {
    return false;
  }
  return statusViewOf(goal) !== null;
}

const byOrder = (a: GoalWithRollup, b: GoalWithRollup): number =>
  a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

/**
 * Writes one goal into every cached list, inserting, updating or removing it as
 * that list's own filter requires.
 */
export function patchGoalInCache(client: QueryClient, goal: GoalWithRollup): void {
  // Walk the cached lists by key, so each one can be judged against its OWN
  // filter. A goal that has just been ticked belongs in the done list and no
  // longer in the active one.
  for (const entry of client.getQueryCache().findAll({ queryKey: goalKeys.lists() })) {
    const previous = entry.state.data as GoalWithRollup[] | undefined;
    if (previous === undefined) continue;

    const query = (entry.queryKey[2] ?? {}) as ListGoalsQuery;
    const without = previous.filter((cached) => cached._id !== goal._id);
    const next = matchesQuery(goal, query) ? [...without, goal].sort(byOrder) : without;

    client.setQueryData(entry.queryKey, next);
  }

  client.setQueryData<GoalDetail>(goalKeys.detail(goal._id), (previous) =>
    previous === undefined ? previous : { ...previous, ...goal },
  );

  // The goal may also be somebody's child, or in today's list.
  client.setQueryData<GoalWithRollup[]>(goalKeys.today(), (previous) =>
    previous?.map((entry) => (entry._id === goal._id ? goal : entry)),
  );

  if (goal.parentGoalId !== null && goal.parentGoalId !== undefined) {
    client.setQueryData<GoalDetail>(goalKeys.detail(goal.parentGoalId), (previous) =>
      previous === undefined
        ? previous
        : {
            ...previous,
            children: previous.children.map((child) => (child._id === goal._id ? goal : child)),
          },
    );
  }
}

export function removeGoalFromCache(client: QueryClient, id: string): void {
  client.setQueriesData<GoalWithRollup[]>({ queryKey: goalKeys.lists() }, (previous) =>
    previous?.filter((goal) => goal._id !== id),
  );
  client.setQueryData<GoalWithRollup[]>(goalKeys.today(), (previous) =>
    previous?.filter((goal) => goal._id !== id),
  );
  client.removeQueries({ queryKey: goalKeys.detail(id) });
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------

export function useGoals(query: ListGoalsQuery): UseQueryResult<GoalWithRollup[]> {
  return useQuery({
    queryKey: goalKeys.list(query),
    queryFn: () => goalsApi.list(query),
  });
}

export function useGoalDetail(id: string): UseQueryResult<GoalDetail> {
  return useQuery({
    queryKey: goalKeys.detail(id),
    queryFn: () => goalsApi.detail(id),
  });
}

/**
 * Candidate parents for a goal at `horizon`: every goal that sits strictly higher.
 *
 * The server is the authority — it re-checks the horizon rule and walks for loops
 * — but offering only valid options means the picker cannot produce a 422 in the
 * ordinary case.
 */
export function useParentCandidates(
  horizon: Horizon | undefined,
  excludeId?: string,
): GoalWithRollup[] {
  const { data } = useGoals({});
  if (data === undefined || horizon === undefined) return [];

  return data.filter((goal) => {
    if (goal._id === excludeId) return false;
    return HORIZON_RANK[goal.horizon] > HORIZON_RANK[horizon];
  });
}

export function useCreateGoal(): UseMutationResult<GoalWithRollup, Error, CreateGoalInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.create,
    onSuccess: (goal) => {
      patchGoalInCache(client, goal);
      // A new child changes its parent's ratio, and only the server knows the
      // new count.
      if (goal.parentGoalId) {
        void client.invalidateQueries({ queryKey: goalKeys.detail(goal.parentGoalId) });
      }
    },
  });
}

export function useUpdateGoal(
  id: string,
): UseMutationResult<GoalWithRollup, Error, UpdateGoalInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateGoalInput) => goalsApi.update(id, patch),
    onSuccess: (goal) => patchGoalInCache(client, goal),
  });
}

/**
 * Tick or un-tick a goal.
 *
 * Optimistic: the X appears immediately. On failure the previous cache is put
 * back, so a dropped connection leaves the paper as it was rather than showing a
 * mark that never saved.
 */
export function useCompleteGoal(): UseMutationResult<
  GoalWithRollup,
  Error,
  { goal: GoalWithRollup; completed: boolean },
  { snapshot: [readonly unknown[], unknown][] }
> {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ goal, completed }) => goalsApi.complete(goal._id, completed),

    onMutate: ({ goal, completed }) => {
      const snapshot = client.getQueriesData({ queryKey: goalKeys.all });

      patchGoalInCache(client, {
        ...goal,
        status: completed ? "done" : "active",
        // The server stamps the real date in the user's timezone; this only has
        // to survive until the response arrives.
        ...(completed ? {} : { completedDate: undefined }),
        isOverdue: completed ? false : goal.isOverdue,
      });

      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        client.setQueryData(key, data);
      }
    },

    onSuccess: (goal) => {
      patchGoalInCache(client, goal);
      // The parent's rollup just moved. The server emits goal:updated for it too;
      // this covers the case where the socket is down.
      if (goal.parentGoalId) {
        void client.invalidateQueries({ queryKey: goalKeys.detail(goal.parentGoalId) });
      }
    },
  });
}

export function useDeleteGoal(): UseMutationResult<{ detached: number }, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.remove,
    onSuccess: (_result, id) => {
      removeGoalFromCache(client, id);
      // Detached children now have no parent — their rows change.
      void client.invalidateQueries({ queryKey: goalKeys.lists() });
    },
  });
}

/** Re-exported so components can render a goal without importing two modules. */
export type { Goal, GoalDetail, GoalWithRollup };
