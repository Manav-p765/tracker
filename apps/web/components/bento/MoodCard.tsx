"use client";

import { MOOD_BANDS, bandFor } from "@tracker/shared";
import Link from "next/link";

import { ColorKeySquares } from "@/components/mood/ColorKeySquares";
import { useTodayCheckin, useUpsertCheckin } from "@/lib/checkins";
import { BentoCard } from "./BentoCard";
import { CardError, CardSkeleton } from "./CardStates";

/**
 * Today's mood, logged in one tap (DESIGN.md §5a).
 *
 * One of the two cards on the dashboard you act on directly. Tapping a square
 * upserts today's check-in immediately — no sheet, no Done — and the card then
 * reflects what is stored. The rest of the ritual lives behind the link.
 *
 * The write is optimistic and the socket echo replaces by date rather than
 * appending, so a tap here and the echo of that same tap converge on one value.
 */
export function MoodCard() {
  const checkin = useTodayCheckin();
  const upsert = useUpsertCheckin();

  const mood = checkin.data?.exists === true ? (checkin.data.mood ?? null) : null;
  const band = bandFor(MOOD_BANDS, mood);

  return (
    <BentoCard tag="CHECK-IN" tone="sage" span={3} index="05">
      {checkin.isPending ? (
        <CardSkeleton />
      ) : checkin.isError ? (
        <CardError onRetry={() => void checkin.refetch()} />
      ) : (
        <>
          <ColorKeySquares
            bands={MOOD_BANDS}
            value={mood}
            name="Mood"
            size="compact"
            disabled={upsert.isPending}
            onSelect={(value) => upsert.mutate({ mood: value })}
            className="mt-1"
          />

          <div className="mt-auto flex items-end justify-between gap-2">
            <p className="text-[0.8125rem] leading-snug text-ink-muted">
              {band === undefined
                ? "Nothing logged yet — start tonight."
                : `Today: ${band.label.toLowerCase()}.`}
            </p>
            <Link
              href="/checkin"
              className="shrink-0 font-mono text-micro uppercase text-ink underline decoration-rule underline-offset-2"
            >
              Full
            </Link>
          </div>
        </>
      )}
    </BentoCard>
  );
}
