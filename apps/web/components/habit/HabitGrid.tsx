"use client";

import { addDays, toDayKey, weekdayOf, type DayKey, type HabitGridRow } from "@tracker/shared";

import { cn } from "@/lib/cn";
import { useToggleHabitLog } from "@/lib/habits";
import { XMarkCell } from "./XMarkCell";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** The seven day keys ending today, oldest first. */
export function recentDays(today: DayKey, count = 7): DayKey[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index - (count - 1)));
}

/** Today in the browser's timezone — the same zone the account was registered with. */
export function browserToday(): DayKey {
  return toDayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * Habits as rows, the last seven days as columns (DESIGN.md §6).
 *
 * Today's column is capped with an ochre rule — the one place ochre appears here,
 * since it is the fixed "today's marker" token. Tapping a cell toggles it
 * optimistically.
 *
 * The evening check-in (Prompt 1.4) reuses this component as-is.
 */
export function HabitGrid({
  rows,
  today,
  days,
  className,
}: {
  rows: HabitGridRow[];
  today: DayKey;
  /** Defaults to the seven days ending today. */
  days?: DayKey[];
  className?: string;
}) {
  const columns = days ?? recentDays(today);
  const toggle = useToggleHabitLog();

  return (
    <table className={cn("border-separate border-spacing-x-1.5 border-spacing-y-1", className)}>
      <thead>
        <tr>
          <th className="w-[5.5rem]">
            <span className="sr-only">Habit</span>
          </th>
          {columns.map((day) => {
            const isToday = day === today;
            return (
              <th key={day} scope="col" className="w-unit-2 pb-1 align-bottom">
                <span
                  aria-hidden="true"
                  className="mx-auto mb-1 block h-px w-unit-2"
                  style={{ backgroundColor: isToday ? "var(--ochre)" : "transparent" }}
                />
                <span
                  className={cn(
                    "block font-mono text-micro font-normal",
                    isToday ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {WEEKDAY_INITIALS[weekdayOf(day)]}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.habit._id}>
            <th
              scope="row"
              className="pr-unit text-left font-mono text-tag font-normal uppercase text-ink-muted"
            >
              {row.habit.name}
            </th>
            {columns.map((day) => {
              const done = row.days[day] === true;
              return (
                <td key={day}>
                  <XMarkCell
                    done={done}
                    pastel={row.habit.pastel}
                    glyph={row.habit.pixelGlyph}
                    isToday={day === today}
                    label={`${row.habit.name} · ${day} · ${done ? "done" : "not logged"}`}
                    onToggle={() =>
                      toggle.mutate({ habitId: row.habit._id, date: day, done: !done })
                    }
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
