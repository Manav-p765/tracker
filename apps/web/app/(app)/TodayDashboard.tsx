"use client";

import { addDays, parseDayKey, toDayKey, type DayKey } from "@tracker/shared";

import { GoalsCard } from "@/components/bento/GoalsCard";
import { HabitsCard } from "@/components/bento/HabitsCard";
import { HeroCard } from "@/components/bento/HeroCard";
import { StreakCard } from "@/components/bento/StreakCard";
import { MoodCard } from "@/components/bento/MoodCard";
import { EventCard, ProjectCard } from "@/components/bento/StubCards";
import { VitalsCard } from "@/components/bento/VitalsCard";
import { SerifHeading } from "@/components/paper/SerifHeading";

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

/**
 * Home — a bento dashboard (DESIGN.md §5a).
 *
 * Summary cards that tap through to their full screens, with two deliberate
 * exceptions that act inline: the hero's goal rows and the habit grid.
 *
 * Cards fetch their own data. That is the point: one failed endpoint degrades one
 * card, and the grid keeps its shape. React Query dedupes the habit grid key that
 * HABITS and STREAK share, so the two cards cost one request.
 */
export function TodayDashboard() {
  // The browser's zone matches the one the account registered with; the server
  // still derives every stored day key itself.
  const today: DayKey = toDayKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const fortnightAgo = addDays(today, -13);
  const { month, day } = parseDayKey(today);

  return (
    <div className="space-y-unit pb-unit-4">
      <header className="flex items-baseline justify-between gap-unit">
        <SerifHeading level={1}>Today</SerifHeading>
        <time dateTime={today} className="text-[0.9375rem] text-ink-muted">
          {MONTH_NAMES[month - 1]} {day}
        </time>
      </header>

      {/*
        Six columns on a phone, twelve from md up. `dense` backfills the holes a
        mixed-span layout leaves, so the grid never goes ragged.
      */}
      <div className="grid grid-cols-6 gap-bento [grid-auto-flow:dense] md:grid-cols-12">
        <HeroCard />
        <GoalsCard />
        <MoodCard />
        <HabitsCard today={today} from={fortnightAgo} />
        <StreakCard today={today} from={fortnightAgo} />
        <ProjectCard />
        <EventCard />
        <VitalsCard />
      </div>
    </div>
  );
}
