"use client";

import type { Pastel } from "@tracker/shared";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { cn } from "@/lib/cn";

/**
 * The goal checkoff: a hairline square that takes a pixel X when done.
 *
 * The cell itself is on the dot-grid rhythm (--dot-gap × 2), but the tap target is
 * padded out past 44px so it is comfortable one-handed (DESIGN.md §8). An empty
 * cell stays genuinely empty — no grey fill, no ghost tick.
 *
 * No celebration on completion. A goal gets an X, and that is all (SCOPE.md §6).
 */
export function GoalCheck({
  done,
  pastel,
  title,
  onToggle,
  disabled = false,
  className,
}: {
  done: boolean;
  pastel: Pastel;
  /** Used for the accessible label: "Mark 'Read 12 books' as done". */
  title: string;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Un-tick “${title}”` : `Tick “${title}” as done`}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        // Padding, not size, makes the target: the drawn cell stays on the grid.
        "-m-1.5 flex min-h-tap min-w-tap items-center justify-center p-1.5",
        "disabled:opacity-60",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-dot-2 w-dot-2 items-center justify-center rounded-paper border-hair border-rule"
      >
        {done ? <PixelGlyph glyph="x" pastel={pastel} scale={3} /> : null}
      </span>
    </button>
  );
}
