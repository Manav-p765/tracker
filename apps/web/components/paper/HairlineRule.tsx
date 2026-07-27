import { cn } from "@/lib/cn";

/**
 * A 1px divider in --rule (DESIGN.md §4). The default boundary in this app —
 * preferred over a bordered card wherever a line will do.
 *
 * `accent` fills the rule with a pastel instead: that is how progress is shown
 * (a filled hairline, never a rounded bar or a percentage ring).
 */
export function HairlineRule({
  className,
  accent,
  /** 0–100. Only meaningful with `accent`. */
  fillPercent,
}: {
  className?: string;
  accent?: "sage" | "clay" | "powder" | "ochre" | "lilac";
  fillPercent?: number;
}) {
  if (accent === undefined) {
    return <hr className={cn("h-px border-0 bg-rule", className)} />;
  }

  const clamped = Math.max(0, Math.min(100, fillPercent ?? 100));
  const fill = {
    sage: "bg-sage",
    clay: "bg-clay",
    powder: "bg-powder",
    ochre: "bg-ochre",
    lilac: "bg-lilac",
  }[accent];

  return (
    <div className={cn("h-px w-full bg-rule", className)}>
      <div className={cn("h-px", fill)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
