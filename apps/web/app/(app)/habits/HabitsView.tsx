"use client";

import { monthKeyOf, type Habit } from "@tracker/shared";
import { useState } from "react";

import { HabitGrid, browserToday, recentDays } from "@/components/habit/HabitGrid";
import { HabitHeatmap } from "@/components/habit/HabitHeatmap";
import { HabitSheet } from "@/components/habit/HabitSheet";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  useArchiveHabit,
  useHabitGrid,
  useHabitHeatmap,
  useHabits,
  useHabitStreak,
  useUpdateHabit,
} from "@/lib/habits";

/**
 * The habits screen: the week's grid, then one panel per habit for its month and
 * its streak.
 *
 * Exactly one file tag, and one vignette — owned by the empty state
 * (DESIGN.md §4, §7).
 */
export function HabitsView() {
  const today = browserToday();
  const days = recentDays(today);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);

  const habits = useHabits(showArchived);
  const grid = useHabitGrid(days[0] ?? today, today);

  const openCreate = (): void => {
    setEditing(undefined);
    setSheetOpen(true);
  };

  const openEdit = (habit: Habit): void => {
    setEditing(habit);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-unit-2 pb-unit-6">
      <header className="space-y-unit">
        <FileTag>HABITS</FileTag>
        <SerifHeading level={1}>Habits</SerifHeading>
        <HairlineRule />
      </header>

      {habits.isPending ? (
        <p className="font-mono text-tag uppercase text-ink-muted">…</p>
      ) : habits.isError ? (
        <p className="text-ink">Could not load your habits.</p>
      ) : habits.data.length === 0 ? (
        <EmptyState>
          Nothing tracked yet. Pick one small thing you want to do most days.
        </EmptyState>
      ) : (
        <>
          <section className="space-y-unit">
            <SerifHeading level={3}>This week</SerifHeading>
            {grid.isPending ? (
              <p className="font-mono text-tag uppercase text-ink-muted">…</p>
            ) : grid.isError ? (
              <p className="text-ink">Could not load the grid.</p>
            ) : (
              <div className="-mx-unit overflow-x-auto px-unit">
                <HabitGrid rows={grid.data} today={today} days={days} />
              </div>
            )}
          </section>

          <HairlineRule />

          <section className="space-y-unit-2">
            <SerifHeading level={3}>The month</SerifHeading>
            {habits.data.map((habit) => (
              <HabitPanel
                key={habit._id}
                habit={habit}
                month={monthKeyOf(today)}
                onEdit={() => openEdit(habit)}
              />
            ))}
          </section>
        </>
      )}

      <HairlineRule />

      <div className="flex items-center justify-between gap-unit">
        <Button variant="plain" onClick={() => setShowArchived((previous) => !previous)}>
          <span className="font-mono text-tag uppercase text-ink-muted">
            {showArchived ? "Hide archived" : "Show archived"}
          </span>
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(var(--rhythm)*3.5)] z-20 mx-auto max-w-content px-unit">
        <Button onClick={openCreate} className="w-full">
          New habit
        </Button>
      </div>

      <HabitSheet open={sheetOpen} onClose={() => setSheetOpen(false)} habit={editing} />
    </div>
  );
}

/**
 * One habit's month: its heatmap, its streak, and the controls for reordering and
 * archiving it.
 *
 * The streak is a plain mono number. No flame, no badge, no celebration — that was
 * cut on purpose (SCOPE.md §6).
 */
function HabitPanel({
  habit,
  month,
  onEdit,
}: {
  habit: Habit;
  month: string;
  onEdit: () => void;
}) {
  const heatmap = useHabitHeatmap(habit._id, month);
  const streak = useHabitStreak(habit._id);
  const archive = useArchiveHabit();
  const update = useUpdateHabit();
  const archived = habit.archivedAt !== null && habit.archivedAt !== undefined;

  return (
    <div className={cn("space-y-unit rounded-paper border-hair border-rule p-unit", archived && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-unit">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="block h-2 w-2 rounded-[1px]"
            style={{ backgroundColor: `var(--${habit.pastel})` }}
          />
          <span className="font-mono text-tag uppercase text-ink">{habit.name}</span>
          {archived ? (
            <span className="font-mono text-micro uppercase text-ink-muted">ARCHIVED</span>
          ) : null}
        </div>

        <p className="font-mono text-micro uppercase text-ink-muted">
          <span data-numeric>{streak.data?.current ?? 0}</span> now
          <span aria-hidden="true"> · </span>
          <span data-numeric>{streak.data?.longest ?? 0}</span> best
        </p>
      </div>

      {heatmap.isPending ? (
        <p className="font-mono text-tag uppercase text-ink-muted">…</p>
      ) : heatmap.isError ? (
        <p className="text-[0.875rem] text-ink">Could not load the month.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <HabitHeatmap days={heatmap.data.days} pastel={habit.pastel} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="plain" onClick={onEdit}>
          <span className="font-mono text-tag uppercase">Edit</span>
        </Button>
        <Button
          variant="plain"
          onClick={() => update.mutate({ id: habit._id, patch: { sortOrder: habit.sortOrder - 1 } })}
          aria-label={`Move ${habit.name} up`}
        >
          <span className="font-mono text-tag uppercase">↑</span>
        </Button>
        <Button
          variant="plain"
          onClick={() => update.mutate({ id: habit._id, patch: { sortOrder: habit.sortOrder + 1 } })}
          aria-label={`Move ${habit.name} down`}
        >
          <span className="font-mono text-tag uppercase">↓</span>
        </Button>
        <Button
          variant="plain"
          onClick={() => archive.mutate({ id: habit._id, archived: !archived })}
          disabled={archive.isPending}
        >
          <span className="font-mono text-tag uppercase">{archived ? "Restore" : "Archive"}</span>
        </Button>
      </div>

      {archived ? null : (
        <p className="text-[0.8125rem] text-ink-muted">
          Archiving keeps every day you have logged — it only leaves today&rsquo;s grid.
        </p>
      )}
    </div>
  );
}
