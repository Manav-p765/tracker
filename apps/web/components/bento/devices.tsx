import type { Pastel } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * The bento dashboard's graphic devices (DESIGN.md §5a).
 *
 * All of them draw from palette vars — no literal colour, no gradients, no
 * shadows, no rounded pill meters.
 */

/** The corner mark on a card that navigates somewhere. */
export function CornerArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path
        d="M3 9 L9 3 M9 3 H4.5 M9 3 V7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="square"
      />
    </svg>
  );
}

/**
 * A segmented bar-meter: `total` cells, `filled` of them inked.
 *
 * Deliberately segmented rather than continuous — it reads as counted things
 * (goals, days) rather than as a percentage, and DESIGN.md §9 rules out rounded
 * progress bars outright.
 */
export function SegmentedMeter({
  filled,
  total,
  colour = "var(--ink)",
  trackColour = "var(--rule)",
  label,
  className,
}: {
  filled: number;
  total: number;
  colour?: string;
  trackColour?: string;
  label?: string;
  className?: string;
}) {
  // Keep the segments legible: past a dozen, a meter becomes a hairline mess.
  const segments = Math.min(Math.max(total, 1), 12);
  const lit = total === 0 ? 0 : Math.round((filled / total) * segments);

  return (
    <div
      className={cn("flex h-1.5 w-full gap-[2px]", className)}
      role="img"
      aria-label={label ?? `${filled} of ${total}`}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className="h-full flex-1"
          style={{ backgroundColor: index < lit ? colour : trackColour }}
        />
      ))}
    </div>
  );
}

/**
 * A barcode strip — bars of varying weight, one per day.
 *
 * Real data only: a heavy bar is a logged day, a hairline is a missed one.
 */
export function BarcodeStrip({
  days,
  pastel,
  className,
}: {
  days: readonly boolean[];
  pastel: Pastel;
  className?: string;
}) {
  return (
    <div className={cn("flex h-8 items-end gap-[3px]", className)} aria-hidden="true">
      {days.map((done, index) => (
        <span
          key={index}
          className="block"
          style={{
            width: done ? "3px" : "1px",
            height: done ? "100%" : "45%",
            backgroundColor: done ? `var(--${pastel})` : "var(--rule)",
          }}
        />
      ))}
    </div>
  );
}

/** A mono index number, as on an archive card: `01 — A`. */
export function IndexTag({ children, className }: { children: string; className?: string }) {
  return (
    <span
      data-numeric
      className={cn("font-mono text-micro uppercase tracking-[0.12em] opacity-70", className)}
    >
      {children}
    </span>
  );
}

/**
 * The one oversized number a card is about, in Fraunces.
 *
 * Numbers are mono everywhere else in this app; the dashboard's headline figures
 * are the deliberate exception, because at this size the serif is the point.
 */
export function BigNumeral({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("font-heading text-[2.5rem] leading-none text-ink", className)}>{children}</p>
  );
}
