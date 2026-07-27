/**
 * Transport-shaped domain entities (ARCHITECTURE.md §3).
 *
 * These describe what crosses the wire: `_id` and every ObjectId ref is a
 * string, dates that are *days* are `DayKey` strings, and true instants are ISO
 * strings. Mongoose models in apps/api mirror these field-for-field.
 *
 * Every user-owned entity carries `userId` — single-user product, multi-user
 * ready model.
 */

import type { DayKey, MonthKey } from "../date/day-key.js";
import type {
  CheckinHalf,
  Difficulty,
  GoalStatus,
  Horizon,
  Pastel,
  ProcessingStatus,
  ProjectStatus,
  Recurrence,
  ResourcePlatform,
  ResourceSource,
  Theme,
} from "./enums.js";

/** A Mongo ObjectId as it appears in JSON. */
export type Id = string;

/** An ISO-8601 instant, e.g. "2026-07-26T18:30:00.000Z". */
export type IsoInstant = string;

export interface Timestamped {
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface UserOwned {
  userId: Id;
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export interface User extends Timestamped {
  _id: Id;
  email: string;
  name?: string;
  /** IANA zone. Every day-key derivation on the server goes through this. */
  timezone: string;
  theme: Theme;
  /** "HH:mm" in the user's own timezone. */
  reminderTime: string;
  remindersEnabled: boolean;
  remindCheckin: boolean;
  remindGoals: boolean;
  remindEvents: boolean;
}

// ---------------------------------------------------------------------------
// goals
// ---------------------------------------------------------------------------

export interface Goal extends Timestamped, UserOwned {
  _id: Id;
  title: string;
  notes?: string;
  horizon: Horizon;
  /** Must reference a goal at a strictly higher horizon. Never cyclic. */
  parentGoalId?: Id | null;
  difficulty?: Difficulty;
  /** Measurable goals: "read 12 books" → targetValue 12, currentValue 3. */
  targetValue?: number;
  currentValue?: number;
  status: GoalStatus;
  dueDate?: DayKey;
  completedDate?: DayKey;
  sortOrder: number;
}

/**
 * Derived progress, computed on read — never stored (SCOPE.md §2).
 * `progressPercent` comes from children when there are any, otherwise from
 * currentValue/targetValue, otherwise it is null.
 */
export interface GoalRollup {
  completedChildren: number;
  totalChildren: number;
  progressPercent: number | null;
}

export interface GoalWithRollup extends Goal {
  rollup: GoalRollup;
  /** Derived: status === "active" && dueDate < today(user timezone). */
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// habits · habitLogs
// ---------------------------------------------------------------------------

export interface Habit extends Timestamped, UserOwned {
  _id: Id;
  name: string;
  /** Stable identity colour for grid marks and heatmap density. */
  pastel: Pastel;
  /** Key into the pixel glyph set (DESIGN.md §7). Defaults to the X. */
  pixelGlyph: string;
  targetPerWeek?: number;
  sortOrder: number;
  archivedAt?: IsoInstant | null;
}

export interface HabitLog extends Timestamped, UserOwned {
  _id: Id;
  habitId: Id;
  date: DayKey;
  done: boolean;
}

/** One row of `GET /habits/grid` — a habit and the days it was ticked. */
export interface HabitGridRow {
  habit: Habit;
  /** DayKey → done. Absent key means never logged, which renders as empty. */
  days: Record<DayKey, boolean>;
}

export interface HabitStreak {
  current: number;
  longest: number;
}

// ---------------------------------------------------------------------------
// checkins
// ---------------------------------------------------------------------------

export interface Checkin extends Timestamped, UserOwned {
  _id: Id;
  date: DayKey;
  /** Morning half: 1–5 intention lines. */
  intention: string[];
  /** 1–10, logged through the pastel color key (DESIGN.md §6). */
  mood?: number;
  energy?: number;
  /** Hours. The third line on the vitals chart. */
  sleep?: number;
  /** The one memorable moment. */
  moment?: string;
  /** Goals ticked during this check-in. */
  completed: Id[];
  morningLoggedAt?: IsoInstant | null;
  eveningLoggedAt?: IsoInstant | null;
}

/** One point on the vitals chart (`GET /history/vitals`). */
export interface VitalsPoint {
  date: DayKey;
  mood: number | null;
  energy: number | null;
  sleep: number | null;
}

export interface MonthSummary {
  month: MonthKey;
  checkinCount: number;
  habitCompletionPercent: number;
  goalsCompleted: number;
  momentCount: number;
}

// ---------------------------------------------------------------------------
// learningProjects · projectMilestones  (v2)
// ---------------------------------------------------------------------------

export interface LearningProject extends Timestamped, UserOwned {
  _id: Id;
  title: string;
  description?: string;
  /** Manual override. null → derive from milestones. */
  progress?: number | null;
  status: ProjectStatus;
  /** Folder-tab identity colour, assigned round-robin at creation. */
  pastel: Pastel;
  targetDate?: DayKey;
  archivedAt?: IsoInstant | null;
}

export interface ProjectMilestone extends Timestamped, UserOwned {
  _id: Id;
  projectId: Id;
  title: string;
  completedDate?: DayKey | null;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// resources  (v2 — project resources AND vault items)
// ---------------------------------------------------------------------------

export interface ResourceLink {
  url: string;
  label?: string;
}

export interface Resource extends Timestamped, UserOwned {
  _id: Id;
  title: string;
  url?: string;
  /** LLM-extracted takeaway, or a hand-written note. */
  summary?: string;
  /** The pasted caption/transcript or fetched text. Retained for reprocessing. */
  rawText?: string;
  links: ResourceLink[];
  tags: string[];
  source: ResourceSource;
  platform?: ResourcePlatform;
  projectId?: Id | null;
  processingStatus?: ProcessingStatus;
  processingError?: string;
}

// ---------------------------------------------------------------------------
// events  (v2)
// ---------------------------------------------------------------------------

export interface ImportantEvent extends Timestamped, UserOwned {
  _id: Id;
  title: string;
  /** Next / only occurrence. */
  date: DayKey;
  recurring: Recurrence;
  reminderLeadDays: number;
  goalId?: Id | null;
  notes?: string;
  lastRolledAt?: IsoInstant | null;
}

export interface UpcomingEvent extends ImportantEvent {
  /** Whole days from today (user timezone) to `date`. */
  daysAway: number;
}

// ---------------------------------------------------------------------------
// pushSubscriptions
// ---------------------------------------------------------------------------

export interface PushSubscriptionRecord extends Timestamped, UserOwned {
  _id: Id;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  timezone?: string;
  lastSuccessAt?: IsoInstant | null;
  lastFailureAt?: IsoInstant | null;
  failureCount: number;
}

// ---------------------------------------------------------------------------
// API envelope (ARCHITECTURE.md §4)
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Payload of `checkin:updated` — re-exported here so both halves stay typed. */
export interface CheckinUpdatedPayload {
  date: DayKey;
  half: CheckinHalf;
  checkin: Checkin;
}
