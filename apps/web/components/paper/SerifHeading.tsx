import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Editorial serif heading in Fraunces (DESIGN.md §3). Two weights only: 400 for
 * screen titles, 600 for the tighter subsection heads.
 */
export function SerifHeading({
  children,
  level = 2,
  className,
}: {
  children: ReactNode;
  level?: 1 | 2 | 3;
  className?: string;
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";

  const size = {
    1: "text-[1.75rem] font-normal",
    2: "text-[1.25rem] font-normal",
    3: "text-[1rem] font-semibold",
  }[level];

  return <Tag className={cn("font-heading leading-tight text-ink", size, className)}>{children}</Tag>;
}
