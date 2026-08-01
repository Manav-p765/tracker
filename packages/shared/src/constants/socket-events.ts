/**
 * Socket.IO event names and payloads (ARCHITECTURE.md §6).
 *
 * Sockets are a notify-only channel: the API emits after a successful write so
 * other devices patch their cache. All writes go through REST, so there is
 * exactly one validation path. Nothing is emitted client → server.
 */

import type {
  Checkin,
  CheckinChangedPayload,
  Goal,
  Habit,
  Id,
  ImportantEvent,
  LearningProjectWithProgress,
} from "../domain/entities.js";
import type { ProcessingStatus } from "../domain/enums.js";
import type { DayKey } from "../date/day-key.js";

export const SOCKET_EVENTS = {
  GOAL_CREATED: "goal:created",
  GOAL_UPDATED: "goal:updated",
  GOAL_DELETED: "goal:deleted",
  GOAL_COMPLETED: "goal:completed",

  HABIT_CREATED: "habit:created",
  HABIT_UPDATED: "habit:updated",
  HABIT_ARCHIVED: "habit:archived",
  HABIT_LOG_CHANGED: "habitLog:changed",

  CHECKIN_CHANGED: "checkin:changed",

  // v2
  PROJECT_CHANGED: "project:changed",
  MILESTONE_CHANGED: "milestone:changed",
  RESOURCE_CHANGED: "resource:changed",
  RESOURCE_PROCESSED: "resource:processed",
  EVENT_UPDATED: "event:updated",

  PUSH_TEST: "push:test",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** One room per user. Every emit is scoped to it. */
export const userRoom = (userId: Id): string => `user:${userId}`;

export interface HabitLogChangedPayload {
  habitId: Id;
  date: DayKey;
  done: boolean;
}

/** A project write: the folder, or its deletion. */
export interface ProjectChangedPayload {
  projectId: Id;
  /** null when the project was deleted. */
  project: LearningProjectWithProgress | null;
}

export interface ResourceProcessedPayload {
  id: Id;
  processingStatus: ProcessingStatus;
}

/** Server → client payload map. Keyed by the wire name, not the constant. */
export interface ServerToClientEvents {
  "goal:created": (goal: Goal) => void;
  "goal:updated": (goal: Goal) => void;
  "goal:deleted": (payload: { id: Id }) => void;
  "goal:completed": (goal: Goal) => void;

  "habit:created": (habit: Habit) => void;
  "habit:updated": (habit: Habit) => void;
  "habit:archived": (habit: Habit) => void;
  "habitLog:changed": (payload: HabitLogChangedPayload) => void;

  "checkin:changed": (payload: CheckinChangedPayload) => void;

  /** The whole project with its derived progress, so the cache can patch in place. */
  "project:changed": (payload: ProjectChangedPayload) => void;
  "milestone:changed": (payload: { projectId: Id }) => void;
  "resource:changed": (payload: { projectId: Id | null }) => void;
  "resource:processed": (payload: ResourceProcessedPayload) => void;
  "event:updated": (event: ImportantEvent) => void;

  "push:test": (payload: { sentAt: string }) => void;
}

/** Deliberately empty — the client only joins its room (ARCHITECTURE.md §6). */
export type ClientToServerEvents = Record<string, never>;

/** Re-exported for convenience at emit sites. */
export type { Checkin, CheckinChangedPayload };
