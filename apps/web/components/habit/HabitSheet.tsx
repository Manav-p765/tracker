"use client";

import { HABIT_GLYPHS, PASTELS, type Habit, type HabitGlyph, type Pastel } from "@tracker/shared";
import { useEffect, useState } from "react";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreateHabit, useUpdateHabit } from "@/lib/habits";

const PASTEL_LABEL: Record<Pastel, string> = {
  sage: "SAGE",
  clay: "CLAY",
  powder: "POWDER",
  ochre: "OCHRE",
  lilac: "LILAC",
};

const GLYPH_LABEL: Record<HabitGlyph, string> = {
  x: "MARK",
  book: "BOOK",
  drop: "DROP",
  shoe: "SHOE",
};

/**
 * Create or rename a habit, pick its pastel and its pixel glyph.
 *
 * The pastel and glyph are the habit's identity: they repeat in the grid, the
 * heatmap and every X it ever draws, so both pickers preview the real thing rather
 * than describing it.
 */
export function HabitSheet({
  open,
  onClose,
  habit,
}: {
  open: boolean;
  onClose: () => void;
  habit?: Habit;
}) {
  const [name, setName] = useState("");
  const [pastel, setPastel] = useState<Pastel>("sage");
  const [glyph, setGlyph] = useState<HabitGlyph>("x");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(habit?.name ?? "");
    setPastel(habit?.pastel ?? "sage");
    setGlyph(((habit?.pixelGlyph as HabitGlyph | undefined) ?? "x") as HabitGlyph);
    setError(null);
  }, [open, habit]);

  const create = useCreateHabit();
  const update = useUpdateHabit();
  const saving = create.isPending || update.isPending;

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Give the habit a name.");
      return;
    }

    try {
      if (habit === undefined) {
        await create.mutateAsync({ name: trimmed, pastel, pixelGlyph: glyph });
      } else {
        await update.mutateAsync({
          id: habit._id,
          patch: { name: trimmed, pastel, pixelGlyph: glyph },
        });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save that. Try again.");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={habit === undefined ? "New habit" : "Edit habit"}
      footer={
        <div className="flex gap-unit">
          <Button variant="plain" onClick={onClose} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} className="flex-[2]" disabled={saving}>
            {saving ? "Saving…" : habit === undefined ? "Add habit" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-unit-2">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Read"
          maxLength={60}
          autoComplete="off"
        />

        <fieldset className="space-y-1.5">
          <legend className="font-mono text-tag uppercase text-ink-muted">Colour</legend>
          <div className="flex gap-unit">
            {PASTELS.map((option) => {
              const selected = option === pastel;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={PASTEL_LABEL[option]}
                  onClick={() => setPastel(option)}
                  className="flex min-h-tap flex-col items-center gap-1"
                >
                  {/* Selection is drawn in ink, never by changing the pastel. */}
                  <span
                    className={cn("block h-unit-2 w-unit-2 rounded-paper", selected ? "border-ink" : "border-rule")}
                    style={{
                      backgroundColor: `var(--${option})`,
                      borderWidth: selected ? "var(--stroke-ink)" : "var(--stroke-hair)",
                      borderStyle: "solid",
                    }}
                  />
                  <span
                    className={cn(
                      "font-mono text-micro uppercase",
                      selected ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {PASTEL_LABEL[option]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="font-mono text-tag uppercase text-ink-muted">Mark</legend>
          <div className="flex gap-unit">
            {HABIT_GLYPHS.map((option) => {
              const selected = option === glyph;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={GLYPH_LABEL[option]}
                  onClick={() => setGlyph(option)}
                  className="flex min-h-tap flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "flex h-unit-2 w-unit-2 items-center justify-center rounded-paper",
                      selected ? "border-ink" : "border-rule",
                    )}
                    style={{
                      borderWidth: selected ? "var(--stroke-ink)" : "var(--stroke-hair)",
                      borderStyle: "solid",
                    }}
                  >
                    <PixelGlyph glyph={option} pastel={pastel} scale={3} />
                  </span>
                  <span
                    className={cn(
                      "font-mono text-micro uppercase",
                      selected ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {GLYPH_LABEL[option]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {error === null ? null : <p className="text-[0.875rem] text-ink">{error}</p>}
      </div>
    </Sheet>
  );
}
