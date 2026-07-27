import {
  addDays,
  ENERGY_BANDS,
  MOOD_BANDS,
  monthKeyOf,
  parseDayKey,
  weekdayOf,
  type DayKey,
  type Pastel,
} from "@tracker/shared";

import { ColorKey } from "@/components/charts/ColorKey";
import { JaggedLine } from "@/components/charts/JaggedLine";
import { XMarkCell } from "@/components/habit/XMarkCell";
import { ColorKeySquares } from "@/components/mood/ColorKeySquares";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { PixelVignette } from "@/components/pixel/PixelVignette";

/**
 * Today — the landing screen.
 *
 * Phase 0 renders it from hardcoded data with no API calls: this screen exists to
 * prove the token layer, the fonts, the dot grid, the X-mark cells, the colour
 * key and the jagged line all look right before a single feature is wired up.
 * Prompt 1.4 replaces the constants below with real data.
 *
 * Two file tags on this screen, and exactly one pixel vignette — the caps set in
 * DESIGN.md §4 and §7.
 */

const TODAY: DayKey = "2026-07-26";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const INTENTIONS = [
  "Finish the reading notes before lunch",
  "Walk the long way home",
  "No screens after ten",
];

interface StubHabit {
  name: string;
  pastel: Pastel;
  glyph: string;
  /** Oldest → today. */
  days: boolean[];
}

const HABITS: StubHabit[] = [
  { name: "Read", pastel: "sage", glyph: "book", days: [true, true, false, true, true, true, true] },
  { name: "Water", pastel: "powder", glyph: "drop", days: [true, false, true, true, true, false, true] },
  { name: "Walk", pastel: "clay", glyph: "shoe", days: [false, true, true, false, true, true, false] },
];

/** Fourteen days ending today, with a two-day gap so the chart line breaks. */
const VITALS = {
  mood: [6, 8, 8, 6, 10, 8, null, null, 6, 8, 10, 8, 8, 10],
  energy: [4, 6, 8, 4, 8, 6, null, null, 4, 6, 8, 6, 8, 8],
  sleep: [6.5, 7, 7.5, 6, 8, 7.5, null, null, 5.5, 7, 8, 7, 7.5, 8],
} satisfies Record<string, (number | null)[]>;

const CHART = { width: 320, height: 88 };

function formatLongDate(key: DayKey): string {
  const { month, day } = parseDayKey(key);
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

export default function TodayPage() {
  // Last seven days, oldest first — derived with the shared day-key helpers so
  // the grid can never drift by a day.
  const gridDays: DayKey[] = Array.from({ length: 7 }, (_, index) => addDays(TODAY, index - 6));
  const monthName = MONTH_NAMES[parseDayKey(TODAY).month - 1] ?? "";

  return (
    <div className="space-y-dot-2 pb-dot-2">
      {/* ---- header: the one pixel vignette on this screen ---- */}
      <header className="space-y-dot">
        <PixelVignette scale={3} />
        <div className="flex items-baseline justify-between gap-dot">
          <SerifHeading level={1}>Today</SerifHeading>
          <time dateTime={TODAY} className="text-[0.9375rem] text-ink-muted">
            {formatLongDate(TODAY)}
          </time>
        </div>
        <HairlineRule />
      </header>

      {/* ---- the day ---- */}
      <section className="space-y-dot-2">
        <FileTag>DAILY</FileTag>

        <div className="space-y-dot">
          <SerifHeading level={3}>Intentions</SerifHeading>
          <ul className="space-y-1.5">
            {INTENTIONS.map((line) => (
              <li key={line} className="flex gap-dot text-ink">
                <span aria-hidden="true" className="font-mono text-ink-muted">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <HairlineRule />

        {/* ---- habit grid: X-mark cells, today's column capped in ochre ---- */}
        <div className="space-y-dot">
          <SerifHeading level={3}>Habits</SerifHeading>
          <table className="border-separate border-spacing-x-1.5 border-spacing-y-1">
            <thead>
              <tr>
                <th className="w-[5.5rem]" />
                {gridDays.map((day, index) => {
                  const isToday = index === gridDays.length - 1;
                  return (
                    <th key={day} scope="col" className="w-dot-2 pb-1 align-bottom">
                      {/* Today's marker is the one ochre element in the grid. */}
                      <span
                        aria-hidden="true"
                        className="mx-auto mb-1 block h-px w-dot-2"
                        style={{ backgroundColor: isToday ? "var(--ochre)" : "transparent" }}
                      />
                      <span className="block font-mono text-micro font-normal text-ink-muted">
                        {WEEKDAY_INITIALS[weekdayOf(day)]}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HABITS.map((habit) => (
                <tr key={habit.name}>
                  <th
                    scope="row"
                    className="pr-dot text-left font-mono text-tag font-normal uppercase text-ink-muted"
                  >
                    {habit.name}
                  </th>
                  {gridDays.map((day, index) => (
                    <td key={day}>
                      <XMarkCell
                        done={habit.days[index] === true}
                        pastel={habit.pastel}
                        glyph={habit.glyph}
                        isToday={index === gridDays.length - 1}
                        label={`${habit.name} · ${day} · ${habit.days[index] === true ? "done" : "not logged"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <HairlineRule />

        {/* ---- mood + energy: the pastel colour key ---- */}
        <div className="space-y-dot">
          <SerifHeading level={3}>Mood</SerifHeading>
          <ColorKeySquares bands={MOOD_BANDS} value={8} />
        </div>

        <div className="space-y-dot">
          <SerifHeading level={3}>Energy</SerifHeading>
          <ColorKeySquares bands={ENERGY_BANDS} value={6} />
        </div>
      </section>

      {/* ---- the month ---- */}
      <section className="space-y-dot-2">
        <FileTag>{`${monthName.toUpperCase()} · ${monthKeyOf(TODAY)}`}</FileTag>

        <div className="space-y-dot">
          <SerifHeading level={3}>Vitals</SerifHeading>
          <svg
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            className="h-auto w-full"
            role="img"
            aria-label="Mood, energy and sleep over the last fourteen days. Two days unlogged."
          >
            <JaggedLine
              values={VITALS.mood}
              min={1}
              max={10}
              width={CHART.width}
              height={CHART.height}
              pastel="sage"
            />
            <JaggedLine
              values={VITALS.energy}
              min={1}
              max={10}
              width={CHART.width}
              height={CHART.height}
              pastel="clay"
            />
            <JaggedLine
              values={VITALS.sleep}
              min={3}
              max={10}
              width={CHART.width}
              height={CHART.height}
              pastel="powder"
            />
          </svg>
          <ColorKey
            series={[
              { label: "Mood", pastel: "sage" },
              { label: "Energy", pastel: "clay" },
              { label: "Sleep", pastel: "powder" },
            ]}
          />
        </div>

        <HairlineRule />

        {/* ---- memorable moments: empty, and deliberately without a vignette ---- */}
        <div className="space-y-dot">
          <SerifHeading level={3}>Memorable moments</SerifHeading>
          <p className="text-ink-muted">Nothing written down yet — start with tonight.</p>
        </div>
      </section>
    </div>
  );
}
