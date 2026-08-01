/**
 * Learning projects (SCOPE.md §4.3).
 *
 * Two rules carry this feature:
 *
 *  1. **Progress is derived, never stored.** `done / total` computed on every read.
 *     Zero milestones is an honest 0 with `hasMilestones: false` — never NaN, and
 *     never a stale percentage left behind by a milestone that moved.
 *  2. **Deleting a project takes its contents with it.** Milestones and
 *     project-scoped resources are removed in the same call. An orphaned milestone
 *     row belongs to a folder that no longer exists and nothing would ever show it
 *     again.
 */

import {
  todayKey,
  type CreateMilestoneInput,
  type CreateProjectInput,
  type CreateResourceInput,
  type LearningProject as ProjectDto,
  type LearningProjectWithProgress,
  type ProjectDetail,
  type ProjectMilestone as MilestoneDto,
  type ProjectProgress,
  type ProjectStatus,
  type ReorderMilestonesInput,
  type Resource as ResourceDto,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
  type UpdateResourceInput,
} from "@tracker/shared";
import {
  LearningProject,
  ProjectMilestone,
  Resource,
  type LearningProjectDoc,
  type ProjectMilestoneDoc,
  type ResourceDoc,
} from "@tracker/db";
import { Types } from "mongoose";

import { AppError } from "../errors.js";
import { emitToUser } from "../realtime/socket.js";
import { getUserTimezone } from "./user-context.service.js";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

function toProjectDto(project: LearningProjectDoc): ProjectDto {
  return {
    _id: String(project._id),
    userId: String(project.userId),
    title: project.title,
    ...(project.description === undefined ? {} : { description: project.description }),
    status: project.status,
    pastel: project.pastel,
    ...(project.targetDate === undefined ? {} : { targetDate: project.targetDate }),
    archivedAt: project.archivedAt === null ? null : (project.archivedAt?.toISOString() ?? null),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toMilestoneDto(milestone: ProjectMilestoneDoc): MilestoneDto {
  const done = milestone.completedDate !== null && milestone.completedDate !== undefined;
  return {
    _id: String(milestone._id),
    userId: String(milestone.userId),
    projectId: String(milestone.projectId),
    title: milestone.title,
    // Exposed as a boolean because that is what a checklist is; the date is kept
    // underneath because when a milestone landed is worth knowing.
    done,
    completedDate: milestone.completedDate ?? null,
    sortOrder: milestone.sortOrder,
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
  };
}

function toResourceDto(resource: ResourceDoc): ResourceDto {
  return {
    _id: String(resource._id),
    userId: String(resource.userId),
    title: resource.title,
    ...(resource.url === undefined ? {} : { url: resource.url }),
    ...(resource.summary === undefined ? {} : { summary: resource.summary }),
    ...(resource.rawText === undefined ? {} : { rawText: resource.rawText }),
    links: resource.links.map((link) => ({
      url: link.url,
      ...(link.label === undefined ? {} : { label: link.label }),
    })),
    tags: resource.tags,
    source: resource.source,
    ...(resource.platform === undefined ? {} : { platform: resource.platform }),
    projectId: resource.projectId === null ? null : String(resource.projectId),
    ...(resource.processingStatus === undefined
      ? {}
      : { processingStatus: resource.processingStatus }),
    ...(resource.processingError === undefined
      ? {}
      : { processingError: resource.processingError }),
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// derived progress
// ---------------------------------------------------------------------------

/** done / total, guarded at zero. */
export function progressFrom(done: number, total: number): ProjectProgress {
  if (total === 0) {
    // The guard that keeps 0/0 from becoming NaN — and `hasMilestones` is what
    // lets the UI say "no milestones yet" rather than a misleading 0%.
    return { done: 0, total: 0, percent: 0, hasMilestones: false };
  }
  return { done, total, percent: Math.round((done / total) * 100), hasMilestones: true };
}

/** Milestone counts for a set of projects, in one aggregation. No N+1. */
async function progressFor(
  userId: string,
  projectIds: readonly Types.ObjectId[],
): Promise<Map<string, ProjectProgress>> {
  if (projectIds.length === 0) return new Map();

  const rows = await ProjectMilestone.aggregate<{
    _id: Types.ObjectId;
    total: number;
    done: number;
  }>([
    { $match: { userId: new Types.ObjectId(userId), projectId: { $in: [...projectIds] } } },
    {
      $group: {
        _id: "$projectId",
        total: { $sum: 1 },
        done: {
          $sum: { $cond: [{ $ifNull: ["$completedDate", false] }, 1, 0] },
        },
      },
    },
  ]);

  const counts = new Map<string, ProjectProgress>();
  for (const row of rows) counts.set(String(row._id), progressFrom(row.done, row.total));
  return counts;
}

const withProgress = (
  project: LearningProjectDoc,
  counts: Map<string, ProjectProgress>,
): LearningProjectWithProgress => ({
  ...toProjectDto(project),
  progress: counts.get(String(project._id)) ?? progressFrom(0, 0),
});

async function emitProject(userId: string, projectId: string): Promise<void> {
  const project = await LearningProject.findOne({ _id: projectId, userId }).lean();
  if (project === null) {
    emitToUser(userId, "project:changed", { projectId, project: null });
    return;
  }
  const counts = await progressFor(userId, [project._id]);
  emitToUser(userId, "project:changed", {
    projectId,
    project: withProgress(project, counts),
  });
}

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

/** Ownership check used by every nested write, so nothing reaches a stranger's folder. */
async function ownedProject(userId: string, projectId: string): Promise<LearningProjectDoc> {
  const project = await LearningProject.findOne({ _id: projectId, userId }).lean();
  if (project === null) throw AppError.notFound("No such project");
  return project;
}

export async function listProjects(
  userId: string,
  status?: ProjectStatus,
): Promise<LearningProjectWithProgress[]> {
  const projects = await LearningProject.find({
    userId,
    ...(status === undefined ? {} : { status }),
  })
    .sort({ updatedAt: -1 })
    .lean();

  const counts = await progressFor(
    userId,
    projects.map((project) => project._id),
  );
  return projects.map((project) => withProgress(project, counts));
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDetail> {
  const project = await ownedProject(userId, projectId);

  const [milestones, resources, counts] = await Promise.all([
    ProjectMilestone.find({ userId, projectId }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    Resource.find({ userId, projectId }).sort({ createdAt: -1 }).lean(),
    progressFor(userId, [project._id]),
  ]);

  return {
    ...withProgress(project, counts),
    milestones: milestones.map(toMilestoneDto),
    resources: resources.map(toResourceDto),
  };
}

/** The next pastel in the cycle, so a stack of folders is never all one colour. */
async function nextPastel(userId: string): Promise<CreateProjectInput["pastel"]> {
  const wheel = ["sage", "clay", "powder", "ochre", "lilac"] as const;
  const count = await LearningProject.countDocuments({ userId });
  return wheel[count % wheel.length];
}

export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<LearningProjectWithProgress> {
  const created = await LearningProject.create({
    userId: new Types.ObjectId(userId),
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.status === undefined ? {} : { status: input.status }),
    pastel: input.pastel ?? (await nextPastel(userId)),
    ...(input.targetDate === undefined ? {} : { targetDate: input.targetDate }),
  });

  const project = withProgress(created.toObject(), new Map());
  emitToUser(userId, "project:changed", { projectId: project._id, project });
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: UpdateProjectInput,
): Promise<LearningProjectWithProgress> {
  const project = await LearningProject.findOne({ _id: projectId, userId });
  if (project === null) throw AppError.notFound("No such project");

  if (patch.title !== undefined) project.title = patch.title;
  if (patch.description !== undefined) project.set("description", patch.description ?? undefined);
  if (patch.status !== undefined) project.status = patch.status;
  if (patch.pastel !== undefined) project.pastel = patch.pastel;
  if (patch.targetDate !== undefined) project.set("targetDate", patch.targetDate ?? undefined);

  await project.save();

  const counts = await progressFor(userId, [project._id]);
  const updated = withProgress(project.toObject(), counts);
  emitToUser(userId, "project:changed", { projectId, project: updated });
  return updated;
}

/**
 * Delete a project and everything filed in it.
 *
 * The cascade is deliberate and total: milestones and project-scoped resources go
 * with the folder. Unlike a goal — whose children are goals in their own right and
 * are therefore only detached — a milestone has no meaning without its project, and
 * a resource attached to a deleted project would be invisible in every screen.
 */
export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<{ milestones: number; resources: number }> {
  await ownedProject(userId, projectId);

  const [milestones, resources] = await Promise.all([
    ProjectMilestone.deleteMany({ userId, projectId }),
    Resource.deleteMany({ userId, projectId }),
  ]);
  await LearningProject.deleteOne({ _id: projectId, userId });

  emitToUser(userId, "project:changed", { projectId, project: null });

  return { milestones: milestones.deletedCount, resources: resources.deletedCount };
}

// ---------------------------------------------------------------------------
// milestones
// ---------------------------------------------------------------------------

export async function addMilestone(
  userId: string,
  projectId: string,
  input: CreateMilestoneInput,
): Promise<MilestoneDto> {
  await ownedProject(userId, projectId);

  const last = await ProjectMilestone.findOne({ userId, projectId })
    .sort({ sortOrder: -1 })
    .select("sortOrder")
    .lean();

  const created = await ProjectMilestone.create({
    userId: new Types.ObjectId(userId),
    projectId: new Types.ObjectId(projectId),
    title: input.title,
    sortOrder: last === null ? 0 : last.sortOrder + 1,
  });

  emitToUser(userId, "milestone:changed", { projectId });
  await emitProject(userId, projectId);
  return toMilestoneDto(created.toObject());
}

export async function updateMilestone(
  userId: string,
  milestoneId: string,
  patch: UpdateMilestoneInput,
  now?: Date,
): Promise<MilestoneDto> {
  const milestone = await ProjectMilestone.findOne({ _id: milestoneId, userId });
  if (milestone === null) throw AppError.notFound("No such milestone");

  if (patch.title !== undefined) milestone.title = patch.title;
  if (patch.done !== undefined) {
    // Stamped in the user's timezone, like every other completion in this app.
    const timezone = await getUserTimezone(userId);
    milestone.completedDate = patch.done ? todayKey(timezone, now ?? new Date()) : null;
  }
  await milestone.save();

  const projectId = String(milestone.projectId);
  emitToUser(userId, "milestone:changed", { projectId });
  await emitProject(userId, projectId);
  return toMilestoneDto(milestone.toObject());
}

export async function deleteMilestone(
  userId: string,
  milestoneId: string,
): Promise<{ projectId: string }> {
  const milestone = await ProjectMilestone.findOne({ _id: milestoneId, userId })
    .select("projectId")
    .lean();
  if (milestone === null) throw AppError.notFound("No such milestone");

  await ProjectMilestone.deleteOne({ _id: milestoneId, userId });

  const projectId = String(milestone.projectId);
  emitToUser(userId, "milestone:changed", { projectId });
  await emitProject(userId, projectId);
  return { projectId };
}

/**
 * Reorder by handing back the whole ordered list.
 *
 * One atomic intent rather than a series of swaps: a half-applied reorder would
 * leave duplicate sortOrders and a list whose order depends on the tiebreak.
 * Ids not belonging to this project are ignored rather than trusted.
 */
export async function reorderMilestones(
  userId: string,
  projectId: string,
  input: ReorderMilestonesInput,
): Promise<MilestoneDto[]> {
  await ownedProject(userId, projectId);

  const owned = await ProjectMilestone.find({ userId, projectId }).select("_id").lean();
  const ownedIds = new Set(owned.map((milestone) => String(milestone._id)));

  const ordered = input.milestoneIds.filter((id) => ownedIds.has(id));

  await ProjectMilestone.bulkWrite(
    ordered.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        update: { $set: { sortOrder: index } },
      },
    })),
  );

  emitToUser(userId, "milestone:changed", { projectId });

  const milestones = await ProjectMilestone.find({ userId, projectId })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  return milestones.map(toMilestoneDto);
}

// ---------------------------------------------------------------------------
// project resources
// ---------------------------------------------------------------------------

export async function addResource(
  userId: string,
  projectId: string,
  input: CreateResourceInput,
): Promise<ResourceDto> {
  await ownedProject(userId, projectId);

  const created = await Resource.create({
    userId: new Types.ObjectId(userId),
    projectId: new Types.ObjectId(projectId),
    title: input.title,
    // An empty string after trimming is no url at all.
    ...(input.url === undefined || input.url === "" ? {} : { url: input.url }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    tags: input.tags ?? [],
    links: [],
    source: "project",
  });

  emitToUser(userId, "resource:changed", { projectId });
  return toResourceDto(created.toObject());
}

export async function updateResource(
  userId: string,
  resourceId: string,
  patch: UpdateResourceInput,
): Promise<ResourceDto> {
  const resource = await Resource.findOne({ _id: resourceId, userId });
  if (resource === null) throw AppError.notFound("No such resource");

  if (patch.title !== undefined) resource.title = patch.title;
  if (patch.url !== undefined) {
    resource.set("url", patch.url === null || patch.url === "" ? undefined : patch.url);
  }
  if (patch.summary !== undefined) resource.set("summary", patch.summary ?? undefined);
  if (patch.tags !== undefined) resource.tags = patch.tags;

  await resource.save();

  emitToUser(userId, "resource:changed", {
    projectId: resource.projectId === null ? null : String(resource.projectId),
  });
  return toResourceDto(resource.toObject());
}

export async function deleteResource(
  userId: string,
  resourceId: string,
): Promise<{ removed: number }> {
  const resource = await Resource.findOne({ _id: resourceId, userId })
    .select("projectId")
    .lean();
  if (resource === null) throw AppError.notFound("No such resource");

  const result = await Resource.deleteOne({ _id: resourceId, userId });

  emitToUser(userId, "resource:changed", {
    projectId: resource.projectId === null ? null : String(resource.projectId),
  });
  return { removed: result.deletedCount };
}
