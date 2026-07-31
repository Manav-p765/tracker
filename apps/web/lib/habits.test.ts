import { QueryClient } from "@tanstack/react-query";
import type { Habit, HabitGridRow } from "@tracker/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { habitKeys, patchHabitInCache, patchLogInCache, type HabitHeatmapData } from "./habits";

/**
 * The optimistic tick writes straight into the cache, so its rules have to match
 * the server's exactly. The one that matters: an un-ticked day is the ABSENCE of a
 * key, never `false` — the server deletes the row, and a cache holding `false`
 * would render a cell that the next refetch silently changes.
 */

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  _id: "habit-1",
  userId: "user-1",
  name: "Read",
  pastel: "sage",
  pixelGlyph: "book",
  sortOrder: 0,
  archivedAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const row = (days: Record<string, boolean> = {}): HabitGridRow => ({ habit: habit(), days });

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("patchLogInCache — the grid", () => {
  it("adds the day when ticked", () => {
    client.setQueryData(habitKeys.grid("2026-07-20", "2026-07-27"), [row()]);
    patchLogInCache(client, "habit-1", "2026-07-27", true);

    const grid = client.getQueryData<HabitGridRow[]>(habitKeys.grid("2026-07-20", "2026-07-27"));
    expect(grid?.[0]?.days).toEqual({ "2026-07-27": true });
  });

  it("DELETES the key when un-ticked, rather than storing false", () => {
    client.setQueryData(habitKeys.grid("2026-07-20", "2026-07-27"), [
      row({ "2026-07-27": true }),
    ]);
    patchLogInCache(client, "habit-1", "2026-07-27", false);

    const grid = client.getQueryData<HabitGridRow[]>(habitKeys.grid("2026-07-20", "2026-07-27"));
    expect(grid?.[0]?.days).toEqual({});
    expect("2026-07-27" in (grid?.[0]?.days ?? {})).toBe(false);
  });

  it("is idempotent — three taps leave one truth", () => {
    client.setQueryData(habitKeys.grid("2026-07-20", "2026-07-27"), [row()]);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      patchLogInCache(client, "habit-1", "2026-07-27", true);
    }
    const grid = client.getQueryData<HabitGridRow[]>(habitKeys.grid("2026-07-20", "2026-07-27"));
    expect(grid?.[0]?.days).toEqual({ "2026-07-27": true });
  });

  it("leaves other habits' rows untouched", () => {
    client.setQueryData(habitKeys.grid("2026-07-20", "2026-07-27"), [
      row(),
      { habit: habit({ _id: "habit-2", name: "Walk" }), days: {} },
    ]);
    patchLogInCache(client, "habit-1", "2026-07-27", true);

    const grid = client.getQueryData<HabitGridRow[]>(habitKeys.grid("2026-07-20", "2026-07-27"));
    expect(grid?.[1]?.days).toEqual({});
  });

  it("patches every cached window that covers the day", () => {
    client.setQueryData(habitKeys.grid("2026-07-20", "2026-07-27"), [row()]);
    client.setQueryData(habitKeys.grid("2026-07-01", "2026-07-31"), [row()]);
    patchLogInCache(client, "habit-1", "2026-07-27", true);

    for (const key of [
      habitKeys.grid("2026-07-20", "2026-07-27"),
      habitKeys.grid("2026-07-01", "2026-07-31"),
    ]) {
      expect(client.getQueryData<HabitGridRow[]>(key)?.[0]?.days).toEqual({ "2026-07-27": true });
    }
  });

  it("does nothing to a grid that was never fetched", () => {
    patchLogInCache(client, "habit-1", "2026-07-27", true);
    expect(client.getQueryData(habitKeys.grid("2026-07-20", "2026-07-27"))).toBeUndefined();
  });
});

describe("patchLogInCache — the heatmap", () => {
  const heatmap = (done: boolean): HabitHeatmapData => ({
    month: "2026-07",
    habit: habit(),
    days: [
      { date: "2026-07-26", done: false, future: false },
      { date: "2026-07-27", done, future: false },
      { date: "2026-07-28", done: false, future: true },
    ],
    completed: done ? 1 : 0,
    elapsed: 2,
  });

  it("flips the day and recounts the total", () => {
    client.setQueryData(habitKeys.heatmap("habit-1", "2026-07"), heatmap(false));
    patchLogInCache(client, "habit-1", "2026-07-27", true);

    const after = client.getQueryData<HabitHeatmapData>(habitKeys.heatmap("habit-1", "2026-07"));
    expect(after?.days[1]?.done).toBe(true);
    expect(after?.completed).toBe(1);
  });

  it("recounts downwards when un-ticked", () => {
    client.setQueryData(habitKeys.heatmap("habit-1", "2026-07"), heatmap(true));
    patchLogInCache(client, "habit-1", "2026-07-27", false);

    const after = client.getQueryData<HabitHeatmapData>(habitKeys.heatmap("habit-1", "2026-07"));
    expect(after?.completed).toBe(0);
  });

  it("ignores a month that does not contain the day", () => {
    client.setQueryData(habitKeys.heatmap("habit-1", "2026-07"), heatmap(false));
    patchLogInCache(client, "habit-1", "2026-06-15", true);

    const after = client.getQueryData<HabitHeatmapData>(habitKeys.heatmap("habit-1", "2026-07"));
    expect(after?.completed).toBe(0);
  });

  it("ignores another habit's heatmap", () => {
    client.setQueryData(habitKeys.heatmap("habit-2", "2026-07"), heatmap(false));
    patchLogInCache(client, "habit-1", "2026-07-27", true);

    const after = client.getQueryData<HabitHeatmapData>(habitKeys.heatmap("habit-2", "2026-07"));
    expect(after?.completed).toBe(0);
  });
});

describe("patchHabitInCache", () => {
  it("adds a new habit to the active list", () => {
    client.setQueryData(habitKeys.list(false), []);
    patchHabitInCache(client, habit());
    expect(client.getQueryData<Habit[]>(habitKeys.list(false))).toHaveLength(1);
  });

  it("removes an archived habit from the active list but keeps it in the full one", () => {
    client.setQueryData(habitKeys.list(false), [habit()]);
    client.setQueryData(habitKeys.list(true), [habit()]);

    patchHabitInCache(client, habit({ archivedAt: "2026-07-27T00:00:00.000Z" }));

    expect(client.getQueryData<Habit[]>(habitKeys.list(false))).toEqual([]);
    expect(client.getQueryData<Habit[]>(habitKeys.list(true))).toHaveLength(1);
  });

  it("puts a restored habit back", () => {
    client.setQueryData(habitKeys.list(false), []);
    patchHabitInCache(client, habit({ archivedAt: null }));
    expect(client.getQueryData<Habit[]>(habitKeys.list(false))).toHaveLength(1);
  });

  it("keeps the list in grid order after a reorder", () => {
    client.setQueryData(habitKeys.list(false), [
      habit({ _id: "a", sortOrder: 0 }),
      habit({ _id: "b", sortOrder: 1 }),
    ]);
    patchHabitInCache(client, habit({ _id: "b", sortOrder: -1 }));

    expect(client.getQueryData<Habit[]>(habitKeys.list(false))?.map((entry) => entry._id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("does not duplicate on a repeated patch", () => {
    client.setQueryData(habitKeys.list(false), [habit()]);
    patchHabitInCache(client, habit({ name: "Once" }));
    patchHabitInCache(client, habit({ name: "Twice" }));

    const list = client.getQueryData<Habit[]>(habitKeys.list(false));
    expect(list).toHaveLength(1);
    expect(list?.[0]?.name).toBe("Twice");
  });
});
