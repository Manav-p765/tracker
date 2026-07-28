import { QueryClient } from "@tanstack/react-query";
import type { GoalWithRollup } from "@tracker/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { goalKeys, patchGoalInCache, removeGoalFromCache, statusViewOf } from "./goals";

/**
 * The cache-patching layer is the riskiest part of the goals UI: it decides which
 * lists a changed goal belongs to WITHOUT asking the server. Get it wrong and a
 * ticked goal lingers in the overdue tab until something else forces a refetch.
 *
 * These drive a real QueryClient the way the socket and the mutations do.
 */

const goal = (overrides: Partial<GoalWithRollup> = {}): GoalWithRollup => ({
  _id: "goal-1",
  userId: "user-1",
  title: "Read 12 books",
  horizon: "monthly",
  parentGoalId: null,
  currentValue: 0,
  status: "active",
  sortOrder: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  rollup: { completedChildren: 0, totalChildren: 0, progressPercent: null },
  isOverdue: false,
  effectiveDueDate: null,
  ...overrides,
});

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

const seed = (query: Parameters<typeof goalKeys.list>[0], goals: GoalWithRollup[]): void => {
  client.setQueryData(goalKeys.list(query), goals);
};
const read = (query: Parameters<typeof goalKeys.list>[0]): GoalWithRollup[] | undefined =>
  client.getQueryData(goalKeys.list(query));

describe("statusViewOf — matches the server's derivation", () => {
  it("reads done from the stored status", () => {
    expect(statusViewOf(goal({ status: "done" }))).toBe("done");
  });

  it("reads overdue from the derived flag, not from a stored value", () => {
    expect(statusViewOf(goal({ isOverdue: true }))).toBe("overdue");
  });

  it("is active when open and not overdue", () => {
    expect(statusViewOf(goal())).toBe("active");
  });

  it("hides archived goals from every view", () => {
    expect(statusViewOf(goal({ status: "archived" }))).toBeNull();
  });

  it("never calls a completed goal overdue, even with the flag set", () => {
    // The server clears isOverdue on completion; belt and braces.
    expect(statusViewOf(goal({ status: "done", isOverdue: true }))).toBe("done");
  });
});

describe("patchGoalInCache — each list judged against its own filter", () => {
  it("moves a ticked goal out of active and into done", () => {
    const open = goal();
    seed({ horizon: "monthly", status: "active" }, [open]);
    seed({ horizon: "monthly", status: "done" }, []);

    patchGoalInCache(client, { ...open, status: "done" });

    expect(read({ horizon: "monthly", status: "active" })).toEqual([]);
    expect(read({ horizon: "monthly", status: "done" })).toHaveLength(1);
  });

  it("moves a ticked overdue goal out of the overdue tab", () => {
    const late = goal({ isOverdue: true, dueDate: "2026-01-01" });
    seed({ horizon: "monthly", status: "overdue" }, [late]);
    seed({ horizon: "monthly", status: "done" }, []);

    patchGoalInCache(client, { ...late, status: "done", isOverdue: false });

    expect(read({ horizon: "monthly", status: "overdue" })).toEqual([]);
    expect(read({ horizon: "monthly", status: "done" })).toHaveLength(1);
  });

  it("puts an un-ticked goal back into active", () => {
    const finished = goal({ status: "done" });
    seed({ horizon: "monthly", status: "done" }, [finished]);
    seed({ horizon: "monthly", status: "active" }, []);

    patchGoalInCache(client, { ...finished, status: "active" });

    expect(read({ horizon: "monthly", status: "done" })).toEqual([]);
    expect(read({ horizon: "monthly", status: "active" })).toHaveLength(1);
  });

  it("leaves a different horizon's list alone", () => {
    const monthly = goal();
    seed({ horizon: "monthly", status: "active" }, [monthly]);
    seed({ horizon: "yearly", status: "active" }, []);

    patchGoalInCache(client, { ...monthly, title: "Renamed" });

    expect(read({ horizon: "yearly", status: "active" })).toEqual([]);
    expect(read({ horizon: "monthly", status: "active" })?.[0]?.title).toBe("Renamed");
  });

  it("removes a goal whose horizon changed out of the old horizon's list", () => {
    const monthly = goal();
    seed({ horizon: "monthly", status: "active" }, [monthly]);

    patchGoalInCache(client, { ...monthly, horizon: "yearly" });

    expect(read({ horizon: "monthly", status: "active" })).toEqual([]);
  });

  it("inserts a goal the list did not have but should", () => {
    seed({ horizon: "monthly", status: "active" }, []);
    patchGoalInCache(client, goal());
    expect(read({ horizon: "monthly", status: "active" })).toHaveLength(1);
  });

  it("keeps lists ordered by sortOrder then creation", () => {
    const first = goal({ _id: "a", sortOrder: 1 });
    const third = goal({ _id: "c", sortOrder: 3 });
    seed({ horizon: "monthly", status: "active" }, [first, third]);

    patchGoalInCache(client, goal({ _id: "b", sortOrder: 2 }));

    expect(read({ horizon: "monthly", status: "active" })?.map((entry) => entry._id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("does not duplicate a goal that is patched twice", () => {
    // The mutation's onSuccess and the socket echo both arrive.
    const open = goal();
    seed({ horizon: "monthly", status: "active" }, [open]);

    patchGoalInCache(client, { ...open, title: "Once" });
    patchGoalInCache(client, { ...open, title: "Twice" });

    const list = read({ horizon: "monthly", status: "active" });
    expect(list).toHaveLength(1);
    expect(list?.[0]?.title).toBe("Twice");
  });

  it("respects a parentGoalId=none filter", () => {
    seed({ parentGoalId: "none" }, []);
    patchGoalInCache(client, goal({ parentGoalId: "parent-1" }));
    expect(read({ parentGoalId: "none" })).toEqual([]);

    patchGoalInCache(client, goal({ _id: "top", parentGoalId: null }));
    expect(read({ parentGoalId: "none" })).toHaveLength(1);
  });

  it("drops an archived goal from every list", () => {
    const open = goal();
    seed({ horizon: "monthly", status: "active" }, [open]);
    seed({ horizon: "monthly" }, [open]);

    patchGoalInCache(client, { ...open, status: "archived" });

    expect(read({ horizon: "monthly", status: "active" })).toEqual([]);
    expect(read({ horizon: "monthly" })).toEqual([]);
  });

  it("updates the goal inside its parent's children list", () => {
    const child = goal({ _id: "child-1", parentGoalId: "parent-1" });
    client.setQueryData(goalKeys.detail("parent-1"), {
      ...goal({ _id: "parent-1", horizon: "yearly" }),
      parentChain: [],
      children: [child],
    });

    patchGoalInCache(client, { ...child, status: "done" });

    const parent = client.getQueryData<{ children: GoalWithRollup[] }>(
      goalKeys.detail("parent-1"),
    );
    expect(parent?.children[0]?.status).toBe("done");
  });

  it("merges into an existing detail entry without dropping its children", () => {
    const detail = {
      ...goal(),
      parentChain: [],
      children: [goal({ _id: "child-1", parentGoalId: "goal-1" })],
    };
    client.setQueryData(goalKeys.detail("goal-1"), detail);

    patchGoalInCache(client, goal({ title: "Renamed" }));

    const after = client.getQueryData<typeof detail>(goalKeys.detail("goal-1"));
    expect(after?.title).toBe("Renamed");
    expect(after?.children).toHaveLength(1);
  });

  it("updates today's list in place", () => {
    const daily = goal({ horizon: "daily" });
    client.setQueryData(goalKeys.today(), [daily]);

    patchGoalInCache(client, { ...daily, status: "done" });

    expect(client.getQueryData<GoalWithRollup[]>(goalKeys.today())?.[0]?.status).toBe("done");
  });

  it("ignores lists that have not been fetched", () => {
    // No seeding at all: nothing should be created out of thin air.
    patchGoalInCache(client, goal());
    expect(read({ horizon: "monthly", status: "active" })).toBeUndefined();
  });
});

describe("removeGoalFromCache", () => {
  it("takes the goal out of every list, today, and its detail entry", () => {
    const open = goal();
    seed({ horizon: "monthly", status: "active" }, [open, goal({ _id: "other" })]);
    client.setQueryData(goalKeys.today(), [open]);
    client.setQueryData(goalKeys.detail("goal-1"), { ...open, parentChain: [], children: [] });

    removeGoalFromCache(client, "goal-1");

    expect(read({ horizon: "monthly", status: "active" })?.map((entry) => entry._id)).toEqual([
      "other",
    ]);
    expect(client.getQueryData(goalKeys.today())).toEqual([]);
    expect(client.getQueryData(goalKeys.detail("goal-1"))).toBeUndefined();
  });
});
