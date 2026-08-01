import type { Pastel, ProjectProgress } from "@tracker/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The archival folder (DESIGN.md §5).
 *
 * An oat panel with a tab protruding from its top edge, offset horizontally so a
 * list reads as a stack of files in a drawer rather than a table of rows. The tab
 * fill is the project's pastel at wash strength; that same pastel repeats on the
 * progress rule and the milestone ticks, so the colour means "this project"
 * everywhere it appears.
 *
 * Geometry and colour only — no paper textures, no drop shadows, no curled
 * corners. The cabinet is implied, not illustrated.
 */

const TAB_FILL: Record<Pastel, string> = {
  sage: "bg-sage-wash",
  clay: "bg-clay-wash",
  powder: "bg-powder-wash",
  ochre: "bg-ochre-wash",
  lilac: "bg-lilac-wash",
};

/** Offsets cycle so a stack looks hand-filed rather than tabulated. */
const TAB_OFFSET = ["left-3", "left-16", "left-28", "left-8", "left-20"] as const;

export function FolderTab({
  tag,
  title,
  pastel,
  offsetIndex = 0,
  href,
  children,
  className,
}: {
  /** The mono file tag, e.g. "PROJECT · JP". The trailing " //" is added here. */
  tag: string;
  title: string;
  pastel: Pastel;
  offsetIndex?: number;
  href?: string;
  children?: ReactNode;
  className?: string;
}) {
  const offset = TAB_OFFSET[offsetIndex % TAB_OFFSET.length];

  const body = (
    <>
      {/* The tab itself: top corners only, hairline border, wash fill. */}
      <span
        className={cn(
          "absolute -top-[18px] flex h-[18px] items-center gap-1.5 border-hair border-b-0 border-rule px-2",
          TAB_FILL[pastel],
          offset,
        )}
        style={{ borderRadius: "var(--radius-tab)" }}
      >
        <span className="font-mono text-micro uppercase leading-none text-ink-muted">
          {tag}
          <span aria-hidden="true">{" //"}</span>
        </span>
      </span>

      <span className="block font-heading text-[1.125rem] leading-tight text-ink">{title}</span>
      {children}
    </>
  );

  const shell = cn(
    "relative mt-[18px] block rounded-paper border-hair border-rule bg-card p-3",
    // Square off the corner the tab sits on, so the two read as one cut sheet.
    "rounded-tl-none",
    className,
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={cn(shell, "transition-colors duration-ink")}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * Progress as a filled hairline in the project's pastel (DESIGN.md §5).
 *
 * Never a rounded bar, never a percentage ring. With no milestones it says so
 * rather than drawing an honest-but-useless empty rule — 0% of nothing is not
 * information.
 */
export function FolderProgress({
  progress,
  pastel,
  className,
}: {
  progress: ProjectProgress;
  pastel: Pastel;
  className?: string;
}) {
  const fill: Record<Pastel, string> = {
    sage: "bg-sage",
    clay: "bg-clay",
    powder: "bg-powder",
    ochre: "bg-ochre",
    lilac: "bg-lilac",
  };

  if (!progress.hasMilestones) {
    return (
      <p className={cn("font-mono text-micro uppercase text-ink-muted", className)}>
        no milestones yet
      </p>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <p className="flex items-baseline justify-between font-mono text-micro uppercase text-ink-muted">
        <span data-numeric>
          {progress.done}/{progress.total}
        </span>
        <span data-numeric>{progress.percent}%</span>
      </p>
      <div className="h-px w-full bg-rule">
        <div
          className={cn("h-px", fill[pastel])}
          style={{ width: `${progress.percent}%` }}
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

/** A mono tag from a project title: "Learn Japanese" → "PROJECT · LE". */
export function projectTag(title: string): string {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
  return `PROJECT · ${initials === "" ? "??" : initials}`;
}
