"use client";

/**
 * Learning projects data layer (ARCHITECTURE.md §7).
 *
 * Milestone ticks are optimistic — including the **derived progress**, which has to
 * be recomputed locally or the percentage lags a network round trip behind the
 * checkbox that caused it.
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
  CreateMilestoneInput,
  CreateProjectInput,
  CreateResourceInput,
  LearningProjectWithProgress,
  ProjectDetail,
  ProjectMilestone,
  ProjectStatus,
  Resource,
  UpdateProjectInput,
  UpdateResourceInput,
} from "@tracker/shared";

import { apiFetch } from "./api";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => ["projects", "list"] as const,
  list: (status?: ProjectStatus) => ["projects", "list", status ?? "all"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export const projectsApi = {
  list: (status?: ProjectStatus) =>
    apiFetch<{ projects: LearningProjectWithProgress[] }>(
      `/projects${status === undefined ? "" : `?status=${status}`}`,
    ).then((data) => data.projects),
  detail: (id: string) =>
    apiFetch<{ project: ProjectDetail }>(`/projects/${id}`).then((data) => data.project),
  create: (input: CreateProjectInput) =>
    apiFetch<{ project: LearningProjectWithProgress }>("/projects", {
      method: "POST",
      body: input,
    }).then((data) => data.project),
  update: (id: string, patch: UpdateProjectInput) =>
    apiFetch<{ project: LearningProjectWithProgress }>(`/projects/${id}`, {
      method: "PATCH",
      body: patch,
    }).then((data) => data.project),
  remove: (id: string) =>
    apiFetch<{ milestones: number; resources: number }>(`/projects/${id}`, { method: "DELETE" }),

  addMilestone: (projectId: string, input: CreateMilestoneInput) =>
    apiFetch<{ milestone: ProjectMilestone }>(`/projects/${projectId}/milestones`, {
      method: "POST",
      body: input,
    }).then((data) => data.milestone),
  setMilestoneDone: (milestoneId: string, done: boolean) =>
    apiFetch<{ milestone: ProjectMilestone }>(`/milestones/${milestoneId}`, {
      method: "PATCH",
      body: { done },
    }).then((data) => data.milestone),
  renameMilestone: (milestoneId: string, title: string) =>
    apiFetch<{ milestone: ProjectMilestone }>(`/milestones/${milestoneId}`, {
      method: "PATCH",
      body: { title },
    }).then((data) => data.milestone),
  deleteMilestone: (milestoneId: string) =>
    apiFetch<{ projectId: string }>(`/milestones/${milestoneId}`, { method: "DELETE" }),
  reorderMilestones: (projectId: string, milestoneIds: string[]) =>
    apiFetch<{ milestones: ProjectMilestone[] }>(`/projects/${projectId}/milestones/order`, {
      method: "PUT",
      body: { milestoneIds },
    }).then((data) => data.milestones),

  addResource: (projectId: string, input: CreateResourceInput) =>
    apiFetch<{ resource: Resource }>(`/projects/${projectId}/resources`, {
      method: "POST",
      body: input,
    }).then((data) => data.resource),
  updateResource: (resourceId: string, patch: UpdateResourceInput) =>
    apiFetch<{ resource: Resource }>(`/resources/${resourceId}`, {
      method: "PATCH",
      body: patch,
    }).then((data) => data.resource),
  deleteResource: (resourceId: string) =>
    apiFetch<{ removed: number }>(`/resources/${resourceId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// cache patching
// ---------------------------------------------------------------------------

/** The same derivation the server does, so an optimistic tick shows the real number. */
export function progressFrom(done: number, total: number) {
  if (total === 0) return { done: 0, total: 0, percent: 0, hasMilestones: false };
  return { done, total, percent: Math.round((done / total) * 100), hasMilestones: true };
}

export function patchProjectInCache(
  client: QueryClient,
  project: LearningProjectWithProgress,
): void {
  for (const entry of client.getQueryCache().findAll({ queryKey: projectKeys.lists() })) {
    const previous = entry.state.data as LearningProjectWithProgress[] | undefined;
    if (previous === undefined) continue;

    const status = entry.queryKey[2];
    const belongs = status === "all" || status === project.status;
    const without = previous.filter((cached) => cached._id !== project._id);

    client.setQueryData(
      entry.queryKey,
      belongs
        ? [project, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : without,
    );
  }

  client.setQueryData<ProjectDetail>(projectKeys.detail(project._id), (previous) =>
    previous === undefined ? previous : { ...previous, ...project },
  );
}

export function removeProjectFromCache(client: QueryClient, projectId: string): void {
  for (const entry of client.getQueryCache().findAll({ queryKey: projectKeys.lists() })) {
    const previous = entry.state.data as LearningProjectWithProgress[] | undefined;
    if (previous === undefined) continue;
    client.setQueryData(
      entry.queryKey,
      previous.filter((project) => project._id !== projectId),
    );
  }
  client.removeQueries({ queryKey: projectKeys.detail(projectId) });
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------

export function useProjects(status?: ProjectStatus): UseQueryResult<LearningProjectWithProgress[]> {
  return useQuery({
    queryKey: projectKeys.list(status),
    queryFn: () => projectsApi.list(status),
  });
}

export function useProject(id: string): UseQueryResult<ProjectDetail> {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projectsApi.detail(id),
  });
}

export function useCreateProject(): UseMutationResult<
  LearningProjectWithProgress,
  Error,
  CreateProjectInput
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => patchProjectInCache(client, project),
  });
}

export function useUpdateProject(
  id: string,
): UseMutationResult<LearningProjectWithProgress, Error, UpdateProjectInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProjectInput) => projectsApi.update(id, patch),
    onSuccess: (project) => patchProjectInCache(client, project),
  });
}

export function useDeleteProject(): UseMutationResult<
  { milestones: number; resources: number },
  Error,
  string
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: projectsApi.remove,
    onSuccess: (_result, id) => removeProjectFromCache(client, id),
  });
}

/**
 * Tick a milestone.
 *
 * Optimistic on both the checkbox AND the derived percentage — recomputing locally
 * is what stops the progress rule lagging a round trip behind the tick that caused
 * it. Replacing by id rather than appending means the socket echo of this same
 * write converges instead of double-applying.
 */
export function useToggleMilestone(
  projectId: string,
): UseMutationResult<
  ProjectMilestone,
  Error,
  { milestoneId: string; done: boolean },
  { previous: ProjectDetail | undefined }
> {
  const client = useQueryClient();
  const key = projectKeys.detail(projectId);

  return useMutation({
    mutationFn: ({ milestoneId, done }) => projectsApi.setMilestoneDone(milestoneId, done),

    onMutate: ({ milestoneId, done }) => {
      const previous = client.getQueryData<ProjectDetail>(key);
      if (previous !== undefined) {
        const milestones = previous.milestones.map((milestone) =>
          milestone._id === milestoneId ? { ...milestone, done } : milestone,
        );
        client.setQueryData<ProjectDetail>(key, {
          ...previous,
          milestones,
          progress: progressFrom(
            milestones.filter((milestone) => milestone.done).length,
            milestones.length,
          ),
        });
      }
      return { previous };
    },

    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) client.setQueryData(key, context.previous);
    },

    onSuccess: (milestone) => {
      client.setQueryData<ProjectDetail>(key, (current) => {
        if (current === undefined) return current;
        const milestones = current.milestones.map((entry) =>
          entry._id === milestone._id ? milestone : entry,
        );
        return {
          ...current,
          milestones,
          progress: progressFrom(
            milestones.filter((entry) => entry.done).length,
            milestones.length,
          ),
        };
      });
      // The list shows the same percentage.
      void client.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/** Milestone add / delete / reorder — all settle by refetching the one detail. */
export function useMilestoneActions(projectId: string) {
  const client = useQueryClient();
  const settle = (): void => {
    void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    void client.invalidateQueries({ queryKey: projectKeys.lists() });
  };

  return {
    add: useMutation({
      mutationFn: (input: CreateMilestoneInput) => projectsApi.addMilestone(projectId, input),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: (milestoneId: string) => projectsApi.deleteMilestone(milestoneId),
      onSuccess: settle,
    }),
    reorder: useMutation({
      mutationFn: (milestoneIds: string[]) =>
        projectsApi.reorderMilestones(projectId, milestoneIds),
      onSuccess: settle,
    }),
  };
}

export function useResourceActions(projectId: string) {
  const client = useQueryClient();
  const settle = (): void => {
    void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  };

  return {
    add: useMutation({
      mutationFn: (input: CreateResourceInput) => projectsApi.addResource(projectId, input),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: (resourceId: string) => projectsApi.deleteResource(resourceId),
      onSuccess: settle,
    }),
  };
}

export type { LearningProjectWithProgress, ProjectDetail, ProjectMilestone, Resource };
