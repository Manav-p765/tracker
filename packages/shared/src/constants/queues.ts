/**
 * BullMQ queue and job names, plus the shared job defaults (ARCHITECTURE.md §5).
 *
 * apps/api produces, apps/worker consumes. Both import from here so a rename
 * cannot silently orphan a queue.
 */

import type { DayKey } from "../date/day-key.js";
import type { Id } from "../domain/entities.js";

export const QUEUE_NAMES = {
  REMINDERS: "reminders",
  PUSH: "push",
  MAINTENANCE: "maintenance",
  VAULT: "vault",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  /** reminders — repeatable, every 5 min. Timezone-aware scan. */
  SCAN_CHECKIN_REMINDERS: "scan-checkin-reminders",
  /** reminders — repeatable, daily. */
  SCAN_GOAL_REMINDERS: "scan-goal-reminders",
  /** reminders — repeatable, daily. v2. */
  SCAN_EVENT_REMINDERS: "scan-event-reminders",
  /** push — on demand. */
  SEND_PUSH: "send-push",
  /** maintenance — repeatable, daily. v2. */
  ROLL_RECURRING_EVENTS: "roll-recurring-events",
  /** vault — on demand. v2. */
  PROCESS_RESOURCE: "process-resource",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/** The three kinds of reminder a push can be (SCOPE.md §4.6). */
export const REMINDER_KINDS = ["checkin", "goal", "event"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * Notification tag per reminder kind, so an unread evening reminder is *replaced*
 * rather than stacked (ARCHITECTURE.md §8).
 */
export const notificationTag = (kind: ReminderKind): string => `tracker:${kind}`;

/**
 * Deterministic job ids. Two scans of the same window produce the same id, so a
 * repeat can never double-send.
 */
export const jobIds = {
  checkinReminder: (userId: Id, date: DayKey): string => `checkin-reminder:${userId}:${date}`,
  goalReminder: (goalId: Id, date: DayKey): string => `goal-reminder:${goalId}:${date}`,
  eventReminder: (eventId: Id, date: DayKey): string => `event-reminder:${eventId}:${date}`,
  processResource: (resourceId: Id): string => `process-resource:${resourceId}`,
} as const;

/** Applied to every job (ARCHITECTURE.md §5). */
export const JOB_DEFAULTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
} as const;

/** How often the check-in scanner runs, and the ± window it matches within. */
export const CHECKIN_SCAN_INTERVAL_MS = 5 * 60 * 1000;
export const CHECKIN_SCAN_WINDOW_MINUTES = 5;

export interface SendPushJobData {
  userId: Id;
  kind: ReminderKind;
  title: string;
  body: string;
  /** Deep link the notification opens (ARCHITECTURE.md §8). */
  url: string;
}
