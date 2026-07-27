/**
 * Socket.IO event names and payloads (ARCHITECTURE.md §6).
 *
 * Sockets are a notify-only channel: the API emits after a successful write so
 * other devices patch their cache. All writes go through REST, so there is
 * exactly one validation path. Nothing is emitted client → server.
 */

import type {
  Checkin,
  CheckinUpdatedPayload,
  Goal,
  Habit,
  Id,
  ImportantEvent,
  LearningProject,
  ProjectMilestone,
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

  CHECKIN_UPDATED: "checkin:updated",

  // v2
  PROJECT_UPDATED: "project:updated",
  MILESTONE_UPDATED: "milestone:updated",
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

  "checkin:updated": (payload: CheckinUpdatedPayload) => void;

  "project:updated": (project: LearningProject) => void;
  "milestone:updated": (milestone: ProjectMilestone) => void;
  "resource:processed": (payload: ResourceProcessedPayload) => void;
  "event:updated": (event: ImportantEvent) => void;

  "push:test": (payload: { sentAt: string }) => void;
}

/** Deliberately empty — the client only joins its room (ARCHITECTURE.md §6). */
export type ClientToServerEvents = Record<string, never>;

/** Re-exported for convenience at emit sites. */
export type { Checkin, CheckinUpdatedPayload };
