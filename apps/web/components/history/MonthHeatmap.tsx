"use client";

import { weekdayOf } from "@tracker/shared";

import { cn } from "@/lib/cn";
import type { HeatmapDay } from "@/lib/history";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** The stepped alpha scale from DESIGN.md §6. Single hue, never a ramp. */
const STEPS = [0, 0.2, 0.45, 0.7, 1] as const;

/**
 * How many of a day's habits were done → one of five steps.
 *
 * This is where the density scale finally earns itself: Prompt 1.3 kept the
 * single-habit heatmap binary, because for one habit a day is done or it isn't.
 * Here a day genuinely has 0–N completions, so the intermediate shades mean
 * something. 0 done is empty paper; all done is the full accent.
 */
function step(done: number, total: number): number {
  if (total === 0 || done === 0) return STEPS[0];
  const ratio = done / total;
  if (ratio >= 1) return STEPS[4];
  if (ratio >= 0.66) return STEPS[3];
  if (ratio >= 0.34) return STEPS[2];
  return STEPS[1];
}

/**
 * The month at a glance — the digital version of the paper X-mark grid.
 *
 * Laid out as calendar weeks so the shape of a month is readable: you can see the
 * weekends sag.
 */
export function MonthHeatmap({
  days,
  futureFrom,
  className,
}: {
  days: readonly HeatmapDay[];
  futureFrom: string | null;
  className?: string;
}) {
  const first = days[0];
  const leading = first === undefined ? 0 : weekdayOf(first.date);
  const cells: (HeatmapDay | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (HeatmapDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <table className="border-separate border-spacing-1">
        <caption className="sr-only">Habits completed each day this month</caption>
        <thead>
          <tr>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <th
                key={`${initial}-${index}`}
                scope="col"
                className="w-6 font-mono text-micro font-normal text-ink-muted"
              >
                {initial}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (day === null) {
                  return <td key={`pad-${weekIndex}-${dayIndex}`} className="h-6 w-6" />;
                }
                // A day still to come is absent, not a miss — no border at all.
                const isFuture = futureFrom !== null && day.date >= futureFrom;
                return (
                  <td key={day.date} className="h-6 w-6">
                    <span
                      title={`${day.date} · ${day.done} of ${day.total}`}
                      className={cn(
                        "block h-6 w-6 rounded-paper",
                        isFuture ? "" : "border-hair border-rule",
                      )}
                      style={
                        isFuture
                          ? undefined
                          : {
                              backgroundColor: "var(--ochre)",
                              opacity: step(day.done, day.total),
                            }
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* The legend, so the shading is readable rather than decorative. */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-micro uppercase text-ink-muted">none</span>
        {STEPS.map((value) => (
          <span
            key={value}
            aria-hidden="true"
            className="block h-3 w-3 rounded-[1px] border-hair border-rule"
            style={{ backgroundColor: "var(--ochre)", opacity: value }}
          />
        ))}
        <span className="font-mono text-micro uppercase text-ink-muted">all</span>
      </div>
    </div>
  );
}
