/**
 * Domain enums (ARCHITECTURE.md §3).
 *
 * Each is a frozen `as const` tuple plus a derived union type, so the same list
 * drives Mongoose enum validators, Zod schemas, and React `map`s. One source.
 */

/** The five goal horizons (SCOPE.md §2). */
export const HORIZONS = ["daily", "weekly", "monthly", "yearly", "longterm"] as const;
export type Horizon = (typeof HORIZONS)[number];

/**
 * Ascending horizon rank. A goal's `parentGoalId` must point at a *strictly
 * higher* rank; skips are legal (daily → yearly). Enforced in Prompt 1.1.
 */
export const HORIZON_RANK: Readonly<Record<Horizon, number>> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  yearly: 3,
  longterm: 4,
};

/** Stored goal status. `overdue` is NOT here — it is derived from `dueDate`. */
export const GOAL_STATUSES = ["active", "done", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** The status *filter* each horizon screen offers (SCOPE.md §2). */
export const GOAL_STATUS_VIEWS = ["active", "done", "overdue"] as const;
export type GoalStatusView = (typeof GOAL_STATUS_VIEWS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The five dusty pastels (DESIGN.md §2). There is no primary accent. */
export const PASTELS = ["sage", "clay", "powder", "ochre", "lilac"] as const;
export type Pastel = (typeof PASTELS)[number];

/** Fixed horizon → pastel assignment (DESIGN.md §2). Applies everywhere. */
export const HORIZON_PASTEL: Readonly<Record<Horizon, Pastel>> = {
  daily: "sage",
  weekly: "powder",
  monthly: "clay",
  yearly: "ochre",
  longterm: "lilac",
};

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Where a `resources` row came from. Vault items and project resources share the collection. */
export const RESOURCE_SOURCES = [
  "vault-url",
  "vault-paste",
  "manual-link",
  "manual-note",
  /** Attached to a learning project rather than pasted into the Vault. */
  "project",
] as const;
export type ResourceSource = (typeof RESOURCE_SOURCES)[number];

export const RESOURCE_PLATFORMS = ["instagram", "tiktok", "youtube", "web", "none"] as const;
export type ResourcePlatform = (typeof RESOURCE_PLATFORMS)[number];

export const PROCESSING_STATUSES = ["pending", "ready", "failed"] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const RECURRENCES = ["none", "weekly", "monthly", "yearly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** Day paper / night paper / follow the OS (DESIGN.md §2). */
export const THEMES = ["day", "night", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const CHECKIN_HALVES = ["morning", "evening"] as const;
export type CheckinHalf = (typeof CHECKIN_HALVES)[number];
