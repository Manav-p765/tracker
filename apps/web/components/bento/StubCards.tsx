"use client";

import { BentoCard } from "./BentoCard";
import { SoonNote } from "./CardStates";

/**
 * Cards for features that are specified but not built (DESIGN.md §5a).
 *
 * Each carries its real treatment and tag so the grid reads as intentional, and
 * each says plainly that the data is not there yet. **Nothing here invents a
 * number.** A fabricated streak or a fake countdown would make the dashboard a
 * liar, and the first real data would silently contradict it.
 */

/** Learning projects — Phase 3.1. Folder-tab corner, powder wash. */
export function ProjectCard() {
  return (
    <BentoCard tag="PROJECT · JP" tone="powder" span={3} index="06" className="pt-5">
      {/* The folder tab, protruding from the card's top edge (DESIGN.md §5). */}
      <span
        aria-hidden="true"
        className="absolute left-3 top-0 h-2 w-14 border-hair border-b-0 border-rule bg-powder-wash"
        style={{ borderRadius: "var(--radius-tab)" }}
      />
      <SoonNote>Milestones, progress and every resource for a topic in one file.</SoonNote>
    </BentoCard>
  );
}

/** Important events — Phase 3.3. Ochre wash, countdown shape. */
export function EventCard() {
  return (
    <BentoCard tag="EVENT" tone="ochre" span={3} index="07">
      <p className="mt-1 font-heading text-[2.5rem] leading-none text-ink opacity-25">—</p>
      <SoonNote>Dated and recurring, counting down in days.</SoonNote>
    </BentoCard>
  );
}
