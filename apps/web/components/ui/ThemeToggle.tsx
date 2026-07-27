"use client";

import { THEMES, type Theme } from "@tracker/shared";

import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";

const LABELS: Record<Theme, string> = {
  day: "DAY",
  night: "NIGHT",
  system: "SYSTEM",
};

/**
 * Day paper / night paper / follow the OS (DESIGN.md §2).
 *
 * Selection is drawn in ink — the same rule as the mood colour key. No pastel is
 * spent on chrome.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Paper"
      className="flex overflow-hidden rounded-paper border-hair border-rule"
    >
      {THEMES.map((option) => {
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option)}
            className={cn(
              "min-h-tap flex-1 border-r-hair border-rule px-dot font-mono text-tag uppercase last:border-r-0",
              "transition-colors duration-ink",
              selected ? "bg-card text-ink" : "text-ink-muted",
            )}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
