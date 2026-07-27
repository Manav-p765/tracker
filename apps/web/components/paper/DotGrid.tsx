import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The dot-grid paper substrate (DESIGN.md §4).
 *
 * The page <body> already carries it, so use this only for a region that must
 * read as bare paper inside something else — a sheet's cut-out, an empty state.
 * Content should space on multiples of --dot-gap so it lands on the grid.
 */
export function DotGrid({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cn("dot-grid", className)}>{children}</div>;
}
