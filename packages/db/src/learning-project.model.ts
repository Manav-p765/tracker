import { PASTELS, PROJECT_STATUSES, type Pastel, type ProjectStatus } from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { optionalDayKey, userIdField } from "./shared-fields.js";

/**
 * learningProjects and projectMilestones (ARCHITECTURE.md §3) — v2, built now so
 * the schema is complete and the indexes exist from the first deploy.
 *
 * `progress` is NOT a column. It is derived from the milestones on every read
 * (done / total) — the same discipline as the goal rollup and derived overdue. A
 * stored percentage is a number that goes stale the moment a milestone moves.
 *
 * `pastel` is the folder-tab identity colour, assigned round-robin at creation so
 * it stays stable for the life of the project.
 */

export interface LearningProjectDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description?: string;
  status: ProjectStatus;
  pastel: Pastel;
  targetDate?: string;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const learningProjectSchema = new Schema<LearningProjectDoc>(
  {
    userId: userIdField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: "active" },
    pastel: { type: String, enum: PASTELS, required: true, default: "sage" },
    targetDate: optionalDayKey,
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "learningProjects" },
);

learningProjectSchema.index({ userId: 1, status: 1 });

export type LearningProjectDocument = HydratedDocument<LearningProjectDoc>;
export const LearningProject: Model<LearningProjectDoc> = model<LearningProjectDoc>(
  "LearningProject",
  learningProjectSchema,
);

export interface ProjectMilestoneDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  projectId: Types.ObjectId;
  title: string;
  completedDate?: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const projectMilestoneSchema = new Schema<ProjectMilestoneDoc>(
  {
    userId: userIdField,
    projectId: { type: Schema.Types.ObjectId, ref: "LearningProject", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    completedDate: { ...optionalDayKey, default: null },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "projectMilestones" },
);

projectMilestoneSchema.index({ userId: 1, projectId: 1, sortOrder: 1 });

export type ProjectMilestoneDocument = HydratedDocument<ProjectMilestoneDoc>;
export const ProjectMilestone: Model<ProjectMilestoneDoc> = model<ProjectMilestoneDoc>(
  "ProjectMilestone",
  projectMilestoneSchema,
);
