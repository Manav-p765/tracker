/**
 * Goal rules (SCOPE.md §2).
 *
 * Four things are derived here and never stored:
 *   - `isOverdue`      — a function of today in the user's timezone
 *   - `effectiveDueDate` — a daily goal is due on its own day
 *   - `rollup`         — completed/total children, or currentValue/targetValue
 *   - the active/done/overdue split behind the status filter
 *
 * Two invariants are enforced on every write:
 *   - a parent must sit at a STRICTLY HIGHER horizon (skips allowed)
 *   - a goal can never be its own ancestor
 */

import {
  HORIZON_RANK,
  toDayKey,
  todayKey,
  type CreateGoalInput,
  type DayKey,
  type Goal as GoalDto,
  type GoalDetail,
  type GoalRollup,
  type GoalStatusView,
  type GoalWithRollup,
  type Horizon,
  type ListGoalsQuery,
  type UpdateGoalInput,
} from "@tracker/shared";
import { Types } from "mongoose";

import { AppError, ERROR_CODES } from "../errors.js";
import { Goal, type GoalDoc } from "@tracker/db";
import { emitToUser } from "../realtime/socket.js";
import { getUserTimezone } from "./user-context.service.js";

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function toGoalDto(goal: GoalDoc): GoalDto {
  return {
    _id: String(goal._id),
    userId: String(goal.userId),
    title: goal.title,
    ...(goal.notes === undefined ? {} : { notes: goal.notes }),
    horizon: goal.horizon,
    parentGoalId: goal.parentGoalId === null ? null : String(goal.parentGoalId),
    ...(goal.difficulty === undefined ? {} : { difficulty: goal.difficulty }),
    ...(goal.targetValue === undefined ? {} : { targetValue: goal.targetValue }),
    currentValue: goal.currentValue,
    status: goal.status,
    ...(goal.dueDate === undefined ? {} : { dueDate: goal.dueDate }),
    ...(goal.completedDate === undefined ? {} : { completedDate: goal.completedDate }),
    sortOrder: goal.sortOrder,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// derivation
// ---------------------------------------------------------------------------

/**
 * The date a goal is judged against.
 *
 * A daily goal without an explicit dueDate is due on the day it was created —
 * that is what "daily" means, and it is why yesterday's unfinished daily goal
 * reads as overdue today. Every other horizon without a dueDate has no deadline,
 * so a long-term goal is never overdue (SCOPE.md §2).
 */
export function effectiveDueDate(goal: GoalDoc, timezone: string): DayKey | null {
  if (goal.dueDate !== undefined) return goal.dueDate;
  if (goal.horizon === "daily") return toDayKey(goal.createdAt, timezone);
  return null;
}

export function isOverdue(goal: GoalDoc, timezone: string, today: DayKey): boolean {
  if (goal.status !== "active") return false;
  const due = effectiveDueDate(goal, timezone);
  // Lexicographic comparison is valid for "YYYY-MM-DD" — that is the point of it.
  return due !== null && due < today;
}

function statusViewOf(goal: GoalDoc, timezone: string, today: DayKey): GoalStatusView | null {
  if (goal.status === "done") return "done";
  if (goal.status === "archived") return null;
  return isOverdue(goal, timezone, today) ? "overdue" : "active";
}

function rollupFor(goal: GoalDoc, counts: { total: number; done: number } | undefined): GoalRollup {
  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;

  if (total > 0) {
    return {
      completedChildren: done,
      totalChildren: total,
      progressPercent: Math.round((done / total) * 100),
    };
  }

  // No children: fall back to a measurable target if the goal has one.
  if (goal.targetValue !== undefined && goal.targetValue > 0) {
    const ratio = Math.min(1, goal.currentValue / goal.targetValue);
    return { completedChildren: 0, totalChildren: 0, progressPercent: Math.round(ratio * 100) };
  }

  // Neither children nor a target — the goal shows only its own checkoff state.
  return { completedChildren: 0, totalChildren: 0, progressPercent: null };
}

/**
 * Child counts for a set of parents, in one aggregation (ARCHITECTURE.md §3:
 * rollup is computed on read, never stored). No N+1.
 */
async function childCounts(
  userId: string,
  parentIds: readonly Types.ObjectId[],
): Promise<Map<string, { total: number; done: number }>> {
  if (parentIds.length === 0) return new Map();

  const rows = await Goal.aggregate<{ _id: Types.ObjectId; total: number; done: number }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        parentGoalId: { $in: [...parentIds] },
        // Archived children are not part of the ratio.
        status: { $ne: "archived" },
      },
    },
    {
      $group: {
        _id: "$parentGoalId",
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), { total: row.total, done: row.done }]));
}

async function decorate(
  userId: string,
  goals: GoalDoc[],
  timezone: string,
  today: DayKey,
): Promise<GoalWithRollup[]> {
  const counts = await childCounts(
    userId,
    goals.map((goal) => goal._id),
  );

  return goals.map((goal) => ({
    ...toGoalDto(goal),
    rollup: rollupFor(goal, counts.get(String(goal._id))),
    isOverdue: isOverdue(goal, timezone, today),
    effectiveDueDate: effectiveDueDate(goal, timezone),
  }));
}

// ---------------------------------------------------------------------------
// invariants
// ---------------------------------------------------------------------------

/** A parent must sit strictly higher. daily → yearly is legal; daily → daily is not. */
function assertHorizonOrder(childHorizon: Horizon, parentHorizon: Horizon): void {
  if (HORIZON_RANK[parentHorizon] <= HORIZON_RANK[childHorizon]) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      422,
      `A ${childHorizon} goal cannot have a ${parentHorizon} parent — the parent must sit at a higher horizon`,
    );
  }
}

/**
 * Walks up from `parentId` looking for `goalId`.
 *
 * Runs BEFORE the horizon check, and the order is deliberate. The horizon rule
 * would reject every one of these cases anyway — a goal's own horizon is never
 * higher than itself, and a descendant always sits lower — but it would explain
 * them as "a yearly goal cannot have a yearly parent", which tells someone who
 * just picked the wrong goal nothing useful. Checking the relationship first
 * means each failure gets the message that names its actual cause.
 *
 * It also handles what the horizon rule cannot see: an inconsistent chain written
 * by a migration or a script. That is why the hop count is bounded — a
 * pre-existing cycle must produce a 422, not an infinite loop.
 */
async function assertNoCycle(userId: string, goalId: string, parentId: string): Promise<void> {
  if (goalId === parentId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 422, "A goal cannot be its own parent");
  }

  const MAX_HOPS = 64;
  let cursor: string | null = parentId;

  for (let hop = 0; hop < MAX_HOPS && cursor !== null; hop += 1) {
    const ancestor: Pick<GoalDoc, "parentGoalId"> | null = await Goal.findOne({
      _id: cursor,
      userId,
    })
      .select("parentGoalId")
      .lean();

    if (ancestor === null) return;

    const next: string | null =
      ancestor.parentGoalId === null || ancestor.parentGoalId === undefined
        ? null
        : String(ancestor.parentGoalId);
    if (next === goalId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        422,
        "That parent would create a loop — a goal cannot be its own ancestor",
      );
    }
    cursor = next;
  }
}

/** Loads a parent, scoped to the user, and checks the horizon rule. */
async function resolveParent(
  userId: string,
  goalId: string | null,
  parentId: string,
  childHorizon: Horizon,
): Promise<Types.ObjectId> {
  const parent = await Goal.findOne({ _id: parentId, userId }).select("horizon").lean();
  if (parent === null) throw AppError.notFound("That parent goal does not exist");

  // Relationship first, then shape — see the note on assertNoCycle.
  if (goalId !== null) await assertNoCycle(userId, goalId, parentId);
  assertHorizonOrder(childHorizon, parent.horizon);

  return new Types.ObjectId(parentId);
}

/**
 * Changing a goal's own horizon can break links in BOTH directions: its parent may
 * no longer be higher, and its children may no longer be lower. Checked here
 * because a horizon patch is the one edit that can invalidate a link it does not
 * mention.
 */
async function assertHorizonChangeIsSafe(
  userId: string,
  goal: GoalDoc,
  nextHorizon: Horizon,
): Promise<void> {
  if (goal.parentGoalId !== null && goal.parentGoalId !== undefined) {
    const parent = await Goal.findOne({ _id: goal.parentGoalId, userId }).select("horizon").lean();
    if (parent !== null) assertHorizonOrder(nextHorizon, parent.horizon);
  }

  const children = await Goal.find({ userId, parentGoalId: goal._id }).select("horizon").lean();
  for (const child of children) {
    assertHorizonOrder(child.horizon, nextHorizon);
  }
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

async function context(userId: string, now?: Date): Promise<{ timezone: string; today: DayKey }> {
  const timezone = await getUserTimezone(userId);
  return { timezone, today: todayKey(timezone, now ?? new Date()) };
}

export async function listGoals(
  userId: string,
  query: ListGoalsQuery,
  now?: Date,
): Promise<GoalWithRollup[]> {
  const { timezone, today } = await context(userId, now);

  const filter: Record<string, unknown> = { userId };
  if (query.horizon !== undefined) filter.horizon = query.horizon;
  if (query.parentGoalId === "none") filter.parentGoalId = null;
  else if (query.parentGoalId !== undefined) filter.parentGoalId = query.parentGoalId;

  // Index-friendly part of the status filter: { userId, horizon, status }.
  if (query.status === "done") filter.status = "done";
  else if (query.status !== undefined) filter.status = "active";
  else filter.status = { $ne: "archived" };

  const goals = await Goal.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();

  /**
   * The active/overdue split finishes here rather than in Mongo. It depends on the
   * user's timezone and, for daily goals, on createdAt — a single predicate for
   * that would be brittle, and one person's goal list is small enough that the
   * indexed fetch above is the part that matters.
   */
  const filtered =
    query.status === undefined
      ? goals
      : goals.filter((goal) => statusViewOf(goal, timezone, today) === query.status);

  return decorate(userId, filtered, timezone, today);
}

/**
 * The check-in screen's list: today's daily goals plus anything else due today.
 *
 * Includes goals already completed today, so the evening checkoff list shows its
 * ticks instead of emptying out as you go (SCOPE.md §3).
 */
export async function listTodayGoals(userId: string, now?: Date): Promise<GoalWithRollup[]> {
  const { timezone, today } = await context(userId, now);

  const candidates = await Goal.find({
    userId,
    status: { $ne: "archived" },
    $or: [{ horizon: "daily" }, { dueDate: today }, { completedDate: today }],
  })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();

  const relevant = candidates.filter((goal) => {
    if (goal.completedDate === today) return true;
    if (goal.status !== "active") return false;
    const due = effectiveDueDate(goal, timezone);
    // Today's, and anything already overdue — an unfinished daily goal from
    // yesterday still needs answering.
    return due !== null && due <= today;
  });

  return decorate(userId, relevant, timezone, today);
}

export async function getGoalDetail(
  userId: string,
  goalId: string,
  now?: Date,
): Promise<GoalDetail> {
  const { timezone, today } = await context(userId, now);

  const goal = await Goal.findOne({ _id: goalId, userId }).lean();
  if (goal === null) throw AppError.notFound("No such goal");

  const children = await Goal.find({ userId, parentGoalId: goal._id, status: { $ne: "archived" } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();

  // Walk up for the breadcrumb. Bounded, in case of pre-existing bad data.
  const parentChain: GoalDto[] = [];
  let cursor = goal.parentGoalId ?? null;
  for (let hop = 0; hop < 64 && cursor !== null; hop += 1) {
    const parent = await Goal.findOne({ _id: cursor, userId }).lean();
    if (parent === null) break;
    parentChain.push(toGoalDto(parent));
    cursor = parent.parentGoalId ?? null;
  }

  const [decorated] = await decorate(userId, [goal], timezone, today);
  if (decorated === undefined) throw AppError.internal("Could not decorate the goal");

  return {
    ...decorated,
    parentChain,
    children: await decorate(userId, children, timezone, today),
  };
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export async function createGoal(
  userId: string,
  input: CreateGoalInput,
  now?: Date,
): Promise<GoalWithRollup> {
  const { timezone, today } = await context(userId, now);

  const parentGoalId =
    input.parentGoalId === undefined || input.parentGoalId === null
      ? null
      : await resolveParent(userId, null, input.parentGoalId, input.horizon);

  const created = await Goal.create({
    userId: new Types.ObjectId(userId),
    title: input.title,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    horizon: input.horizon,
    parentGoalId,
    ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
    ...(input.targetValue === undefined ? {} : { targetValue: input.targetValue }),
    currentValue: input.currentValue ?? 0,
    ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
    sortOrder: input.sortOrder ?? 0,
  });

  const [decorated] = await decorate(userId, [created.toObject()], timezone, today);
  if (decorated === undefined) throw AppError.internal("Could not decorate the new goal");

  emitToUser(userId, "goal:created", decorated);
  return decorated;
}

export async function updateGoal(
  userId: string,
  goalId: string,
  patch: UpdateGoalInput,
  now?: Date,
): Promise<GoalWithRollup> {
  const { timezone, today } = await context(userId, now);

  const goal = await Goal.findOne({ _id: goalId, userId });
  if (goal === null) throw AppError.notFound("No such goal");

  const nextHorizon = patch.horizon ?? goal.horizon;
  if (patch.horizon !== undefined && patch.horizon !== goal.horizon) {
    await assertHorizonChangeIsSafe(userId, goal.toObject(), patch.horizon);
    goal.horizon = patch.horizon;
  }

  if (patch.parentGoalId !== undefined) {
    goal.parentGoalId =
      patch.parentGoalId === null
        ? null
        : await resolveParent(userId, goalId, patch.parentGoalId, nextHorizon);
  }

  if (patch.title !== undefined) goal.title = patch.title;
  if (patch.notes !== undefined) goal.set("notes", patch.notes ?? undefined);
  if (patch.difficulty !== undefined) goal.set("difficulty", patch.difficulty ?? undefined);
  if (patch.targetValue !== undefined) goal.set("targetValue", patch.targetValue ?? undefined);
  if (patch.currentValue !== undefined) goal.currentValue = patch.currentValue;
  if (patch.dueDate !== undefined) goal.set("dueDate", patch.dueDate ?? undefined);
  if (patch.sortOrder !== undefined) goal.sortOrder = patch.sortOrder;

  await goal.save();

  const [decorated] = await decorate(userId, [goal.toObject()], timezone, today);
  if (decorated === undefined) throw AppError.internal("Could not decorate the goal");

  emitToUser(userId, "goal:updated", decorated);
  return decorated;
}

/**
 * Check a goal off, or un-check it.
 *
 * Deliberately independent of the children: "A parent can be checked off manually
 * regardless of child state; the child ratio still shows underneath"
 * (SCOPE.md §2). The completion date is stamped in the user's timezone.
 */
export async function setGoalCompleted(
  userId: string,
  goalId: string,
  completed: boolean,
  now?: Date,
): Promise<GoalWithRollup> {
  const { timezone, today } = await context(userId, now);

  const goal = await Goal.findOne({ _id: goalId, userId });
  if (goal === null) throw AppError.notFound("No such goal");

  if (completed) {
    goal.status = "done";
    goal.completedDate = today;
  } else {
    goal.status = "active";
    goal.set("completedDate", undefined);
  }
  await goal.save();

  const [decorated] = await decorate(userId, [goal.toObject()], timezone, today);
  if (decorated === undefined) throw AppError.internal("Could not decorate the goal");

  emitToUser(userId, "goal:completed", decorated);
  // A parent's rollup just changed; tell the client to re-read that one goal.
  if (goal.parentGoalId) {
    const parent = await Goal.findOne({ _id: goal.parentGoalId, userId }).lean();
    if (parent !== null) {
      const [parentDecorated] = await decorate(userId, [parent], timezone, today);
      if (parentDecorated !== undefined) emitToUser(userId, "goal:updated", parentDecorated);
    }
  }

  return decorated;
}

/**
 * Delete a goal. Children are DETACHED, not deleted (ARCHITECTURE.md §4) — losing
 * a year's worth of monthly goals because the yearly one was tidied away would be
 * indefensible.
 */
export async function deleteGoal(userId: string, goalId: string): Promise<{ detached: number }> {
  const goal = await Goal.findOne({ _id: goalId, userId }).select("_id").lean();
  if (goal === null) throw AppError.notFound("No such goal");

  const detached = await Goal.updateMany(
    { userId, parentGoalId: goal._id },
    { $set: { parentGoalId: null } },
  );
  await Goal.deleteOne({ _id: goal._id, userId });

  emitToUser(userId, "goal:deleted", { id: goalId });
  return { detached: detached.modifiedCount };
}
