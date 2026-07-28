import type { SelectHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/cn";

/**
 * A select sitting on a hairline rule, matching TextField (DESIGN.md §4).
 *
 * Native `<select>` on purpose: Android's own picker is a better one-handed
 * control than anything reimplemented here, and it inherits the system's
 * accessibility for free.
 */
export function SelectField<T extends string>({
  label,
  hint,
  options,
  className,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  hint?: string;
  options: readonly { value: T; label: string }[];
}) {
  const id = useId();

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-mono text-tag uppercase text-ink-muted">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={cn(
          "min-h-tap w-full rounded-none border-0 border-b border-b-rule bg-transparent px-0",
          "text-ink focus:outline-none focus-visible:border-ink",
        )}
        style={{ borderBottomWidth: "var(--stroke-hair)" }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
