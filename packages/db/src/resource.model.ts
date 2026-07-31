import {
  PROCESSING_STATUSES,
  RESOURCE_PLATFORMS,
  RESOURCE_SOURCES,
  type ProcessingStatus,
  type ResourcePlatform,
  type ResourceSource,
} from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { userIdField } from "./shared-fields.js";

/**
 * resources (ARCHITECTURE.md §3) — v2.
 *
 * IMPORTANT: this one collection holds **both** project resources (links and
 * notes attached to a learning project) and **Vault items**. There is no separate
 * vault collection. `source` is what distinguishes them:
 *
 *   vault-url / vault-paste → a Vault item, LLM-processed
 *   manual-link / manual-note → something typed in by hand
 *
 * `rawText` keeps the pasted caption or transcript so an item can be reprocessed
 * without asking the user to paste it again.
 */

export interface ResourceLinkDoc {
  url: string;
  label?: string;
}

export interface ResourceDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  url?: string;
  summary?: string;
  rawText?: string;
  links: ResourceLinkDoc[];
  tags: string[];
  source: ResourceSource;
  platform?: ResourcePlatform;
  projectId?: Types.ObjectId | null;
  processingStatus?: ProcessingStatus;
  processingError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const resourceLinkSchema = new Schema<ResourceLinkDoc>(
  {
    url: { type: String, required: true, trim: true },
    label: { type: String, trim: true },
  },
  { _id: false },
);

const resourceSchema = new Schema<ResourceDoc>(
  {
    userId: userIdField,
    title: { type: String, required: true, trim: true, maxlength: 300 },
    url: { type: String, trim: true },
    summary: { type: String, trim: true },
    rawText: { type: String },
    links: { type: [resourceLinkSchema], default: [] },
    tags: {
      type: [String],
      default: [],
      // Tags are matched, filtered and counted — always lowercase.
      set: (tags: string[]) => tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    },
    source: { type: String, enum: RESOURCE_SOURCES, required: true },
    platform: { type: String, enum: RESOURCE_PLATFORMS },
    projectId: { type: Schema.Types.ObjectId, ref: "LearningProject", default: null },
    processingStatus: { type: String, enum: PROCESSING_STATUSES },
    processingError: { type: String },
  },
  { timestamps: true, collection: "resources" },
);

resourceSchema.index({ userId: 1, createdAt: -1 });
resourceSchema.index({ userId: 1, tags: 1 });
resourceSchema.index({ userId: 1, projectId: 1 });

// Vault search. Weighted so a match in the extracted summary beats a match buried
// in a raw transcript.
resourceSchema.index(
  { title: "text", summary: "text", rawText: "text", tags: "text" },
  {
    name: "resource_text",
    weights: { title: 10, summary: 6, tags: 4, rawText: 1 },
  },
);

export type ResourceDocument = HydratedDocument<ResourceDoc>;
export const Resource: Model<ResourceDoc> = model<ResourceDoc>("Resource", resourceSchema);
