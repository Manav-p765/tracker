"use client";

import { SLEEP_MAX, SLEEP_MIN, SLEEP_STEP } from "@tracker/shared";

import { cn } from "@/lib/cn";

/**
 * Hours slept, in half-hour steps.
 *
 * A stepper and a slider rather than a text field: the evening flow has to be
 * completable with thumbs in under a minute, and a numeric keyboard popping up for
 * "7.5" is the slowest thing on the screen.
 *
 * The slider is a real `<input type="range">`, so it is keyboard-operable and
 * announced with its value; the buttons give precision without dragging.
 */
export function SleepStepper({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (value: number) => void;
  className?: string;
}) {
  const current = value ?? 7;

  const clamp = (next: number): number =>
    Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, Math.round(next * 2) / 2));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <StepButton
          label="Half an hour less"
          symbol="−"
          onClick={() => onChange(clamp(current - SLEEP_STEP))}
          disabled={current <= SLEEP_MIN}
        />

        <p className="min-w-[4.5rem] text-center">
          <span data-numeric className="font-heading text-[1.75rem] leading-none text-ink">
            {value === null ? "—" : current.toFixed(1)}
          </span>
          <span className="ml-1 font-mono text-micro uppercase text-ink-muted">hrs</span>
        </p>

        <StepButton
          label="Half an hour more"
          symbol="+"
          onClick={() => onChange(clamp(current + SLEEP_STEP))}
          disabled={current >= SLEEP_MAX}
        />
      </div>

      <input
        type="range"
        min={SLEEP_MIN}
        max={SLEEP_MAX}
        step={SLEEP_STEP}
        value={current}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        aria-label="Hours slept"
        aria-valuetext={`${current.toFixed(1)} hours`}
        className="h-tap w-full accent-[var(--sage)]"
      />
    </div>
  );
}

function StepButton({
  label,
  symbol,
  onClick,
  disabled,
}: {
  label: string;
  symbol: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-tap min-w-tap items-center justify-center rounded-paper border-hair border-rule bg-card font-mono text-[1.125rem] text-ink disabled:opacity-40"
    >
      <span aria-hidden="true">{symbol}</span>
    </button>
  );
}
