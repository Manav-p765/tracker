/**
 * @tracker/shared — the only cross-app dependency (ARCHITECTURE.md §2).
 *
 * Exports the domain types and enums, the socket/queue constants, and the day-key
 * helpers. apps/web, apps/api and apps/worker all import from here; no app ever
 * imports from another app.
 */

export * from "./domain/enums.js";
export * from "./domain/entities.js";
export * from "./domain/scales.js";
export * from "./date/day-key.js";
export * from "./constants/socket-events.js";
export * from "./constants/queues.js";
export * from "./schemas/common.js";
export * from "./schemas/auth.js";
export * from "./schemas/goal.js";
export * from "./schemas/habit.js";
export * from "./schemas/checkin.js";
export * from "./schemas/push.js";
