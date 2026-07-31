"use client";

import {
  ENERGY_BANDS,
  MOOD_BANDS,
  toDayKey,
  type DayKey,
  type GoalWithRollup,
} from "@tracker/shared";
import { useEffect, useState } from "react";

import { GoalCheck } from "@/components/goals/GoalCheck";
import { HabitGrid } from "@/components/habit/HabitGrid";
import { ColorKeySquares } from "@/components/mood/ColorKeySquares";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { useCheckin, useUpsertCheckin } from "@/lib/checkins";
import { cn } from "@/lib/cn";
import { useTodayGoals } from "@/lib/goals";
import { useHabitGrid } from "@/lib/habits";
import { SleepStepper } from "./SleepStepper";

export const browserToday = (): DayKey =>
  toDayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

/**
 * The evening check-in (SCOPE.md §3) — the app's heartbeat.
 *
 * In order: habits, mood, energy, sleep, moment, goals. One "Done" commits the
 * upsert. Designed to be finished with thumbs in under a minute, which is why
 * mood and energy are one tap each and sleep is a stepper rather than a keyboard.
 *
 * Two things save immediately rather than waiting for Done, because they are
 * writes to other collections that stand on their own:
 *   - habit ticks (habitLogs)
 * Everything else is local state until Done, so a half-filled sheet costs nothing
 * and an abandoned one leaves no partial row.
 *
 * On failure the form keeps every value — the text you typed is the most expensive
 * thing on this screen and must survive a dropped connection.
 */
export function EveningCheckin({ date }: { date?: DayKey }) {
  const today = browserToday();
  const day = date ?? today;
  const isBackfill = day !== today;

  const existing = useCheckin(day);
  const goals = useTodayGoals();
  const grid = useHabitGrid(day, day);
  const upsert = useUpsertCheckin();

  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [moment, setMoment] = useState("");
  const [tickedGoals, setTickedGoals] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed from whatever is already logged, once it arrives.
  useEffect(() => {
    if (existing.data === undefined || !existing.data.exists) return;
    setMood(existing.data.mood ?? null);
    setEnergy(existing.data.energy ?? null);
    setSleepHours(existing.data.sleepHours ?? null);
    setMoment(existing.data.moment ?? "");
    setTickedGoals(new Set(existing.data.completedGoalIds));
  }, [existing.data]);

  const toggleGoal = (goal: GoalWithRollup): void => {
    setTickedGoals((previous) => {
      const next = new Set(previous);
      if (next.has(goal._id)) next.delete(goal._id);
      else next.add(goal._id);
      return next;
    });
    setSaved(false);
  };

  async function commit(): Promise<void> {
    setError(null);
    try {
      await upsert.mutateAsync({
        ...(isBackfill ? { date: day } : {}),
        mood,
        energy,
        sleepHours,
        moment: moment.trim() === "" ? null : moment.trim(),
        completedGoalIds: [...tickedGoals],
        completed: true,
      });
      setSaved(true);
    } catch (caught) {
      // Nothing is cleared here on purpose — the typed moment survives.
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save that. Your entry is still here — try again.",
      );
    }
  }

  return (
    <div className="space-y-unit-2 pb-unit-6">
      <header className="space-y-unit">
        <p className="font-mono text-tag uppercase text-ink-muted">
          {isBackfill ? "BACKFILL" : "TONIGHT"}
          <span aria-hidden="true">{" //"}</span>
        </p>
        <div className="flex items-baseline justify-between gap-unit">
          <SerifHeading level={1}>Check in</SerifHeading>
          <time dateTime={day} className="text-[0.9375rem] text-ink-muted">
            {day}
          </time>
        </div>
        <HairlineRule />
      </header>

      {/* 1 — habits. These save as you tap; they are their own collection. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Habits</SerifHeading>
        {grid.isPending ? (
          <p className="font-mono text-tag uppercase text-ink-muted">…</p>
        ) : grid.isError ? (
          <RetryLine label="Could not load your habits." onRetry={() => void grid.refetch()} />
        ) : grid.data.length === 0 ? (
          <p className="text-[0.875rem] text-ink-muted">
            No habits yet — you can add some later.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <HabitGrid rows={grid.data} today={day} days={[day]} />
          </div>
        )}
      </section>

      <HairlineRule />

      {/* 2 — mood. One tap. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Mood</SerifHeading>
        <ColorKeySquares
          bands={MOOD_BANDS}
          value={mood}
          name="Mood"
          onSelect={(next) => {
            setMood(next);
            setSaved(false);
          }}
        />
      </section>

      {/* 3 — energy. Same control, own labels. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Energy</SerifHeading>
        <ColorKeySquares
          bands={ENERGY_BANDS}
          value={energy}
          name="Energy"
          onSelect={(next) => {
            setEnergy(next);
            setSaved(false);
          }}
        />
      </section>

      <HairlineRule />

      {/* 4 — sleep. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Sleep</SerifHeading>
        <SleepStepper
          value={sleepHours}
          onChange={(next) => {
            setSleepHours(next);
            setSaved(false);
          }}
        />
      </section>

      <HairlineRule />

      {/* 5 — the one line worth keeping. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Memorable moment</SerifHeading>
        <TextField
          label="What's worth remembering about today?"
          value={moment}
          onChange={(event) => {
            setMoment(event.target.value);
            setSaved(false);
          }}
          placeholder="Walked the long way home"
          maxLength={280}
          autoComplete="off"
        />
      </section>

      <HairlineRule />

      {/* 6 — today's goals. Committed with Done, through the goals service. */}
      <section className="space-y-unit">
        <SerifHeading level={3}>Today&rsquo;s goals</SerifHeading>
        {goals.isPending ? (
          <p className="font-mono text-tag uppercase text-ink-muted">…</p>
        ) : goals.isError ? (
          <RetryLine label="Could not load today's goals." onRetry={() => void goals.refetch()} />
        ) : goals.data.length === 0 ? (
          <p className="text-[0.875rem] text-ink-muted">Nothing due today.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {goals.data.map((goal) => {
              const ticked = tickedGoals.has(goal._id) || goal.status === "done";
              return (
                <li key={goal._id} className="flex items-center gap-unit py-2">
                  <GoalCheck
                    done={ticked}
                    pastel="sage"
                    title={goal.title}
                    onToggle={() => toggleGoal(goal)}
                  />
                  <span
                    className={cn(
                      "flex-1 text-[0.9375rem] text-ink",
                      ticked && "text-ink-muted line-through",
                    )}
                  >
                    {goal.title}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error === null ? null : (
        <p role="alert" className="text-[0.875rem] text-ink">
          {error}
        </p>
      )}

      {/* The single commit, in the thumb arc. */}
      <div className="sticky bottom-unit-3 space-y-2 pt-unit">
        <Button
          onClick={() => void commit()}
          disabled={upsert.isPending}
          className="w-full"
        >
          {upsert.isPending ? "Saving…" : saved ? "Saved — done" : "Done"}
        </Button>
        <p className="text-center font-mono text-micro uppercase text-ink-muted">
          {saved ? "logged for " : "nothing is saved until you tap done · "}
          {saved ? day : ""}
        </p>
      </div>
    </div>
  );
}

function RetryLine({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-micro uppercase text-ink-muted">{"// couldn't load"}</p>
      <p className="text-[0.875rem] text-ink-muted">{label}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[1.75rem] font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
