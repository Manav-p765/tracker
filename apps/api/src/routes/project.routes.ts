import {
  createMilestoneSchema,
  createProjectSchema,
  createResourceSchema,
  listProjectsQuerySchema,
  milestoneIdParamSchema,
  projectIdParamSchema,
  reorderMilestonesSchema,
  resourceIdParamSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateResourceSchema,
  type ListProjectsQuery,
} from "@tracker/shared";
import { Router } from "express";

import { asyncHandler } from "../middleware/error-handler.js";
import { currentUserId, requireAuth } from "../middleware/require-auth.js";
import { validate } from "../middleware/validate.js";
import * as projects from "../services/project.service.js";

/** ARCHITECTURE.md §4 — learning projects. Every route scoped to req.userId. */
export const projectRouter = Router();

projectRouter.use(requireAuth);

projectRouter.get(
  "/",
  validate({ query: listProjectsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.query as unknown as ListProjectsQuery;
    res.json({ data: { projects: await projects.listProjects(currentUserId(req), status) } });
  }),
);

projectRouter.post(
  "/",
  validate({ body: createProjectSchema }),
  asyncHandler(async (req, res) => {
    const project = await projects.createProject(currentUserId(req), req.body);
    res.status(201).json({ data: { project } });
  }),
);

projectRouter.get(
  "/:id",
  validate({ params: projectIdParamSchema }),
  asyncHandler(async (req, res) => {
    const project = await projects.getProject(currentUserId(req), req.params.id as string);
    res.json({ data: { project } });
  }),
);

projectRouter.patch(
  "/:id",
  validate({ params: projectIdParamSchema, body: updateProjectSchema }),
  asyncHandler(async (req, res) => {
    const project = await projects.updateProject(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: { project } });
  }),
);

projectRouter.delete(
  "/:id",
  validate({ params: projectIdParamSchema }),
  asyncHandler(async (req, res) => {
    const data = await projects.deleteProject(currentUserId(req), req.params.id as string);
    res.json({ data });
  }),
);

// --- milestones, nested under their project ---------------------------------

projectRouter.post(
  "/:id/milestones",
  validate({ params: projectIdParamSchema, body: createMilestoneSchema }),
  asyncHandler(async (req, res) => {
    const milestone = await projects.addMilestone(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.status(201).json({ data: { milestone } });
  }),
);

projectRouter.put(
  "/:id/milestones/order",
  validate({ params: projectIdParamSchema, body: reorderMilestonesSchema }),
  asyncHandler(async (req, res) => {
    const milestones = await projects.reorderMilestones(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: { milestones } });
  }),
);

projectRouter.post(
  "/:id/resources",
  validate({ params: projectIdParamSchema, body: createResourceSchema }),
  asyncHandler(async (req, res) => {
    const resource = await projects.addResource(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.status(201).json({ data: { resource } });
  }),
);

/**
 * Milestones and resources are addressed by their own id once they exist — they
 * are top-level rows, and threading the project id through every edit would only
 * be a second thing to get wrong.
 */
export const milestoneRouter = Router();
milestoneRouter.use(requireAuth);

milestoneRouter.patch(
  "/:id",
  validate({ params: milestoneIdParamSchema, body: updateMilestoneSchema }),
  asyncHandler(async (req, res) => {
    const milestone = await projects.updateMilestone(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: { milestone } });
  }),
);

milestoneRouter.delete(
  "/:id",
  validate({ params: milestoneIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await projects.deleteMilestone(currentUserId(req), req.params.id as string) });
  }),
);

export const resourceRouter = Router();
resourceRouter.use(requireAuth);

resourceRouter.patch(
  "/:id",
  validate({ params: resourceIdParamSchema, body: updateResourceSchema }),
  asyncHandler(async (req, res) => {
    const resource = await projects.updateResource(
      currentUserId(req),
      req.params.id as string,
      req.body,
    );
    res.json({ data: { resource } });
  }),
);

resourceRouter.delete(
  "/:id",
  validate({ params: resourceIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await projects.deleteResource(currentUserId(req), req.params.id as string) });
  }),
);
