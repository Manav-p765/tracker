"use client";

import { useEffect, useState } from "react";

import { HairlineRule } from "@/components/paper/HairlineRule";
import { TextField } from "@/components/ui/TextField";
import { ApiError, authApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

/**
 * When reminders arrive, and which ones.
 *
 * The time is stored on the user and interpreted in **their** timezone by the
 * worker, so this field is a wall-clock time, not a UTC offset. Changing it takes
 * effect on the next sweep — there is no per-user schedule to tear down.
 */
export function ReminderSettings() {
  const { user, setUser } = useSession();

  const [time, setTime] = useState(user?.reminderTime ?? "21:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.reminderTime !== undefined) setTime(user.reminderTime);
  }, [user?.reminderTime]);

  if (user === null || user === undefined) return null;

  const patch = async (body: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      setUser(await authApi.updateMe(body));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  const toggles: { key: "remindCheckin" | "remindGoals" | "remindStreak"; label: string; note: string }[] =
    [
      { key: "remindCheckin", label: "EVENING CHECK-IN", note: "At the time above, if not logged." },
      { key: "remindGoals", label: "GOAL DUE", note: "Mid-morning, for goals due that day." },
      { key: "remindStreak", label: "STREAK AT RISK", note: "Late evening, only with a run going." },
    ];

  return (
    <div className="space-y-unit">
      <TextField
        label="Evening reminder time"
        type="time"
        value={time}
        onChange={(event) => {
          setTime(event.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          if (time !== user.reminderTime && /^\d{2}:\d{2}$/.test(time)) {
            void patch({ reminderTime: time });
          }
        }}
        hint={`In your own timezone (${user.timezone}). Takes effect on the next sweep.`}
      />

      <HairlineRule />

      <fieldset className="space-y-2" disabled={saving}>
        <legend className="font-mono text-tag uppercase text-ink-muted">Which reminders</legend>

        <label className="flex min-h-tap items-center justify-between gap-unit">
          <span className="text-[0.9375rem] text-ink">All reminders</span>
          <Switch
            checked={user.remindersEnabled}
            onChange={(next) => void patch({ remindersEnabled: next })}
            label="All reminders"
          />
        </label>

        <div className={cn("space-y-2 pl-unit", !user.remindersEnabled && "opacity-50")}>
          {toggles.map(({ key, label, note }) => (
            <label key={key} className="flex min-h-tap items-center justify-between gap-unit">
              <span className="min-w-0">
                <span className="block font-mono text-tag uppercase text-ink">{label}</span>
                <span className="block text-[0.8125rem] text-ink-muted">{note}</span>
              </span>
              <Switch
                checked={user[key]}
                disabled={!user.remindersEnabled}
                onChange={(next) => void patch({ [key]: next })}
                label={label}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {error !== null ? (
        <p role="alert" className="text-[0.875rem] text-ink">
          {error}
        </p>
      ) : saved ? (
        <p className="font-mono text-micro uppercase text-ink-muted">saved</p>
      ) : null}
    </div>
  );
}

/** A paper switch: ink for on, hairline for off. State is spelled out, not colour-coded. */
function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "shrink-0 rounded-paper border-hair px-2 py-1 font-mono text-micro uppercase",
        "transition-colors duration-ink disabled:opacity-40",
        checked ? "border-ink bg-card text-ink" : "border-rule text-ink-muted",
      )}
    >
      {checked ? "ON" : "OFF"}
    </button>
  );
}
