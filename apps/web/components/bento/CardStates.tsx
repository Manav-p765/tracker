import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The three states every dashboard card owns (DESIGN.md §5a).
 *
 * The rule they exist to enforce: one dead endpoint degrades ONE card. The grid
 * keeps its shape, the other cards keep their data, and the broken one says so
 * plainly and offers a retry.
 */

/**
 * A card-shaped placeholder while data is in flight.
 *
 * Card-shaped so the grid does not jump when the data lands, and deliberately
 * still — no shimmer, no pulse (DESIGN.md §8). Just the quiet mono ellipsis the
 * rest of the app uses.
 */
export function CardSkeleton({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col justify-end gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="block h-2 rounded-paper bg-rule opacity-50"
          style={{ width: index === 0 ? "70%" : "45%" }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** A failed fetch, contained to this card. */
export function CardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-1.5">
      <p className="font-mono text-micro uppercase text-ink-muted">{"// couldn't load"}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[1.75rem] self-start font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
      >
        Retry
      </button>
    </div>
  );
}

/** Nothing to show yet — calm, and with a way in. */
export function CardEmpty({ children, href }: { children: string; href?: string }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-1.5">
      <p className="text-[0.8125rem] leading-snug text-ink-muted">{children}</p>
      {href === undefined ? null : (
        <Link
          href={href}
          className="min-h-[1.75rem] font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
        >
          Add one
        </Link>
      )}
    </div>
  );
}

/**
 * A feature that does not exist yet.
 *
 * Marked, never faked: the card carries its real treatment and tag so the grid
 * looks intentional, and this note says plainly that the data is not there. No
 * placeholder numbers — a fabricated streak is worse than an empty card.
 */
export function SoonNote({ children }: { children: string }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-1.5">
      <p className="text-[0.8125rem] leading-snug text-ink-muted">{children}</p>
      <p className="font-mono text-micro uppercase tracking-[0.12em] text-ink-muted">
        {"// soon"}
      </p>
    </div>
  );
}
