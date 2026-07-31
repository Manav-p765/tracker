import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { CornerArrow } from "./devices";

export type CardTone = "card" | "dark" | "sage" | "clay" | "powder" | "ochre" | "lilac";

const TONE_CLASS: Record<CardTone, string> = {
  card: "bg-card text-ink border-hair border-rule",
  dark: "bg-dark text-dark-ink border-hair border-dark",
  sage: "bg-sage-wash text-ink border-hair border-rule",
  clay: "bg-clay-wash text-ink border-hair border-rule",
  powder: "bg-powder-wash text-ink border-hair border-rule",
  ochre: "bg-ochre-wash text-ink border-hair border-rule",
  lilac: "bg-lilac-wash text-ink border-hair border-rule",
};

/** Tailwind needs whole class names, so the spans are enumerated, not built. */
const SPAN_CLASS: Record<number, string> = {
  2: "col-span-2 md:col-span-4",
  3: "col-span-3 md:col-span-6",
  4: "col-span-4 md:col-span-8",
  6: "col-span-6 md:col-span-12",
};

/**
 * One panel of the bento dashboard (DESIGN.md §5a).
 *
 * Two shapes, and the difference is an accessibility one rather than a visual one:
 *
 *  - `href` makes the WHOLE card a link. Use it for summary cards, which have
 *    nothing to interact with inside them.
 *  - `headerHref` links only the tag. Use it when the card has its own buttons —
 *    a link wrapping a button is invalid, and a screen reader would read the
 *    whole grid of controls as one destination.
 */
export function BentoCard({
  tag,
  tone = "card",
  span = 3,
  href,
  headerHref,
  dashed = false,
  index,
  children,
  className,
}: {
  tag: string;
  tone?: CardTone;
  span?: 2 | 3 | 4 | 6;
  href?: string;
  headerHref?: string;
  /** A dashed outline marks a card whose content is a live grid, not a summary. */
  dashed?: boolean;
  /** The mono index in the corner, e.g. "01 — A". */
  index?: string;
  children: ReactNode;
  className?: string;
}) {
  const navigates = href !== undefined;

  const shell = cn(
    "relative flex min-h-[7.5rem] flex-col gap-2 rounded-paper p-3",
    TONE_CLASS[tone],
    dashed && "border-dashed",
    SPAN_CLASS[span],
    className,
  );

  const header = (
    <div className="flex items-start justify-between gap-2">
      {headerHref === undefined ? (
        <p
          className={cn(
            "font-mono text-tag uppercase",
            tone === "dark" ? "text-dark-ink opacity-80" : "text-ink-muted",
          )}
        >
          {tag}
          <span aria-hidden="true">{" //"}</span>
        </p>
      ) : (
        <Link
          href={headerHref}
          className={cn(
            "flex min-h-[1.75rem] items-center gap-1 font-mono text-tag uppercase",
            tone === "dark" ? "text-dark-ink opacity-80" : "text-ink-muted",
          )}
        >
          {tag}
          <span aria-hidden="true">{" //"}</span>
          <CornerArrow />
        </Link>
      )}

      <div className="flex items-center gap-1.5">
        {index === undefined ? null : (
          <span
            data-numeric
            className={cn(
              "font-mono text-micro uppercase tracking-[0.12em]",
              tone === "dark" ? "text-dark-ink opacity-60" : "text-ink-muted",
            )}
          >
            {index}
          </span>
        )}
        {navigates ? <CornerArrow className="mt-0.5 opacity-70" /> : null}
      </div>
    </div>
  );

  const body = (
    <>
      {header}
      {children}
    </>
  );

  if (navigates) {
    return (
      <Link href={href} className={cn(shell, "transition-colors duration-ink")}>
        {body}
      </Link>
    );
  }

  return <section className={shell}>{body}</section>;
}
