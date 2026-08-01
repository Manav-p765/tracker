"use client";

import { BentoCard } from "./BentoCard";
import { SoonNote } from "./CardStates";

/**
 * Cards for features that are specified but not built (DESIGN.md §5a).
 *
 * Each carries its real treatment and tag so the grid reads as intentional, and
 * each says plainly that the data is not there yet. **Nothing here invents a
 * number.** A fabricated countdown would make the dashboard a liar, and the first
 * real data would silently contradict it.
 *
 * Only events remain — vitals went live in Phase 1.5, projects in 3.1.
 */

/** Important events — Phase 3.3. Ochre wash, countdown shape. */
export function EventCard() {
  return (
    <BentoCard tag="EVENT" tone="ochre" span={3} index="07">
      <p className="mt-1 font-heading text-[2.5rem] leading-none text-ink opacity-25">—</p>
      <SoonNote>Dated and recurring, counting down in days.</SoonNote>
    </BentoCard>
  );
}
