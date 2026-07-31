"use client";

import { weekdayOf, type Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";
import type { HeatmapDay } from "@/lib/habits";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** The stepped alpha scale from DESIGN.md §6. Single hue, never a ramp. */
const DENSITY_STEPS = [0, 0.2, 0.45, 0.7, 1] as const;

/** 0–7 completed days in a week → one of the five steps. */
function densityStep(done: number, total: number): number {
  if (total === 0 || done === 0) return DENSITY_STEPS[0];
  const ratio = done / total;
  if (ratio <= 0.25) return DENSITY_STEPS[1];
  if (ratio <= 0.5) return DENSITY_STEPS[2];
  if (ratio < 1) return DENSITY_STEPS[3];
  return DENSITY_STEPS[4];
}

interface Week {
  days: (HeatmapDay | null)[];
  done: number;
  elapsed: number;
}

/** Lays the month out as calendar weeks, padding the first row to its weekday. */
function toWeeks(days: HeatmapDay[]): Week[] {
  const weeks: Week[] = [];
  let current: (HeatmapDay | null)[] = [];

  const first = days[0];
  if (first !== undefined) {
    for (let index = 0; index < weekdayOf(first.date); index += 1) current.push(null);
  }

  for (const day of days) {
    current.push(day);
    if (current.length === 7) {
      weeks.push(summarise(current));
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(null);
    weeks.push(summarise(current));
  }
  return weeks;
}

function summarise(days: (HeatmapDay | null)[]): Week {
  const real = days.filter((day): day is HeatmapDay => day !== null);
  return {
    days,
    done: real.filter((day) => day.done).length,
    elapsed: real.filter((day) => !day.future).length,
  };
}

/**
 * One habit, one month, in that habit's own pastel (DESIGN.md §6).
 *
 * A note on the stepped alpha scale. For a single habit a day is done or it isn't,
 * so a per-cell "density" could only ever be 0 or 1 — inventing intermediate
 * shades would misrepresent the data. The cells are therefore honest binary, and
 * the five steps drive the **week rule** on the right, where 0–7 completed days is
 * a real gradient. The stacked all-habits heatmap in Prompt 1.5 uses the steps
 * per-cell, which is where they were designed to land.
 *
 * Single hue throughout. Never a multi-hue ramp, never green-to-red.
 */
export function HabitHeatmap({
  days,
  pastel,
  className,
}: {
  days: HeatmapDay[];
  pastel: Pastel;
  className?: string;
}) {
  const weeks = toWeeks(days);
  const colour = `var(--${pastel})`;

  return (
    <table className={cn("border-separate border-spacing-1", className)}>
      <thead>
        <tr>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <th
              key={`${initial}-${index}`}
              scope="col"
              className="w-5 font-mono text-micro font-normal text-ink-muted"
            >
              {initial}
            </th>
          ))}
          <th scope="col" className="pl-2 font-mono text-micro font-normal text-ink-muted">
            WK
          </th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, weekIndex) => (
          <tr key={weekIndex}>
            {week.days.map((day, dayIndex) => (
              <td key={day?.date ?? `pad-${weekIndex}-${dayIndex}`} className="h-5 w-5">
                {day === null ? null : (
                  <span
                    title={`${day.date}${day.done ? " · done" : ""}`}
                    className={cn(
                      "block h-5 w-5 rounded-paper",
                      // A future day is absent, not a miss — no border at all.
                      day.future ? "" : "border-hair border-rule",
                    )}
                    style={day.done ? { backgroundColor: colour } : undefined}
                  />
                )}
              </td>
            ))}
            {/* The week's density, on the stepped scale. */}
            <td className="pl-2">
              <span
                className="block h-5 w-6 self-center"
                title={`${week.done} of ${week.elapsed} days`}
              >
                <span
                  className="mt-2 block h-px w-full bg-rule"
                  aria-hidden="true"
                  style={{
                    backgroundColor: colour,
                    opacity: densityStep(week.done, week.elapsed),
                  }}
                />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
