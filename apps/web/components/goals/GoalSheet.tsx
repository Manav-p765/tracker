"use client";

import { DIFFICULTIES, type Difficulty, type GoalWithRollup, type Horizon } from "@tracker/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { Sheet } from "@/components/ui/Sheet";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { useCreateGoal, useParentCandidates, useUpdateGoal } from "@/lib/goals";
import { HORIZONS, HORIZON_LABEL, HORIZON_TAG } from "./horizon-meta";

const HORIZON_OPTIONS = HORIZONS.map((horizon) => ({
  value: horizon,
  label: HORIZON_LABEL[horizon],
}));

const DIFFICULTY_OPTIONS = [
  { value: "" as const, label: "—" },
  ...DIFFICULTIES.map((difficulty) => ({
    value: difficulty,
    label: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
  })),
];

interface FormState {
  title: string;
  notes: string;
  horizon: Horizon;
  parentGoalId: string;
  dueDate: string;
  difficulty: Difficulty | "";
  targetValue: string;
}

const emptyForm = (horizon: Horizon): FormState => ({
  title: "",
  notes: "",
  horizon,
  parentGoalId: "",
  dueDate: "",
  difficulty: "",
  targetValue: "",
});

const formFor = (goal: GoalWithRollup): FormState => ({
  title: goal.title,
  notes: goal.notes ?? "",
  horizon: goal.horizon,
  parentGoalId: goal.parentGoalId ?? "",
  dueDate: goal.dueDate ?? "",
  difficulty: goal.difficulty ?? "",
  targetValue: goal.targetValue === undefined ? "" : String(goal.targetValue),
});

/**
 * Create or edit a goal, as a bottom sheet (DESIGN.md §8).
 *
 * The parent picker offers only goals at a strictly higher horizon, recomputed
 * whenever the horizon changes — so the ordinary path cannot produce the 422 the
 * server would return. The server still validates; this just stops the UI from
 * inviting a mistake.
 */
export function GoalSheet({
  open,
  onClose,
  /** Pre-selects the horizon when creating from a horizon screen. */
  horizon,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  horizon: Horizon;
  /** Present = edit, absent = create. */
  goal?: GoalWithRollup;
}) {
  const [form, setForm] = useState<FormState>(() =>
    goal === undefined ? emptyForm(horizon) : formFor(goal),
  );
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the sheet opens, so a cancelled edit does not leak into the next.
  useEffect(() => {
    if (!open) return;
    setForm(goal === undefined ? emptyForm(horizon) : formFor(goal));
    setError(null);
  }, [open, goal, horizon]);

  const create = useCreateGoal();
  const update = useUpdateGoal(goal?._id ?? "");
  const saving = create.isPending || update.isPending;

  const candidates = useParentCandidates(form.horizon, goal?._id);

  // Clear a parent that the current horizon no longer permits.
  useEffect(() => {
    if (form.parentGoalId === "") return;
    if (!candidates.some((candidate) => candidate._id === form.parentGoalId)) {
      setForm((previous) => ({ ...previous, parentGoalId: "" }));
    }
  }, [candidates, form.parentGoalId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }));

  async function submit(): Promise<void> {
    setError(null);
    const title = form.title.trim();
    if (title === "") {
      setError("Give the goal a title.");
      return;
    }

    const shared = {
      title,
      horizon: form.horizon,
      notes: form.notes.trim() === "" ? null : form.notes.trim(),
      parentGoalId: form.parentGoalId === "" ? null : form.parentGoalId,
      dueDate: form.dueDate === "" ? null : form.dueDate,
      difficulty: form.difficulty === "" ? null : form.difficulty,
      targetValue: form.targetValue === "" ? null : Number(form.targetValue),
    };

    try {
      if (goal === undefined) {
        // Create rejects nulls for the optional fields, so drop them instead.
        await create.mutateAsync({
          title: shared.title,
          horizon: shared.horizon,
          ...(shared.notes === null ? {} : { notes: shared.notes }),
          ...(shared.parentGoalId === null ? {} : { parentGoalId: shared.parentGoalId }),
          ...(shared.dueDate === null ? {} : { dueDate: shared.dueDate }),
          ...(shared.difficulty === null ? {} : { difficulty: shared.difficulty }),
          ...(shared.targetValue === null ? {} : { targetValue: shared.targetValue }),
        });
      } else {
        await update.mutateAsync(shared);
      }
      onClose();
    } catch (caught) {
      // The server's message is the useful one — "the parent must sit at a higher
      // horizon" beats anything generic invented here.
      setError(
        caught instanceof ApiError ? caught.message : "Could not save that. Try again.",
      );
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal === undefined ? "New goal" : "Edit goal"}
      footer={
        <div className="flex gap-unit">
          <Button variant="plain" onClick={onClose} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} className="flex-[2]" disabled={saving}>
            {saving ? "Saving…" : goal === undefined ? "Add goal" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-unit">
        <TextField
          label="Title"
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Read 12 books"
          maxLength={200}
          autoComplete="off"
        />

        <SelectField
          label="Horizon"
          value={form.horizon}
          onChange={(event) => set("horizon", event.target.value as Horizon)}
          options={HORIZON_OPTIONS}
        />

        <SelectField
          label="Part of"
          value={form.parentGoalId}
          onChange={(event) => set("parentGoalId", event.target.value)}
          options={[
            { value: "", label: "— nothing higher —" },
            ...candidates.map((candidate) => ({
              value: candidate._id,
              label: `${HORIZON_TAG[candidate.horizon]} · ${candidate.title}`,
            })),
          ]}
          hint={
            candidates.length === 0
              ? "Nothing at a higher horizon yet — a goal can only sit under a longer one."
              : undefined
          }
        />

        <TextField
          label="Due"
          type="date"
          value={form.dueDate}
          onChange={(event) => set("dueDate", event.target.value)}
          hint={form.horizon === "daily" ? "A daily goal is due on its own day if left blank." : undefined}
        />

        <div className="flex gap-unit">
          <SelectField
            label="Difficulty"
            value={form.difficulty}
            onChange={(event) => set("difficulty", event.target.value as Difficulty | "")}
            options={DIFFICULTY_OPTIONS}
            className="flex-1"
          />
          <TextField
            label="Target"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.targetValue}
            onChange={(event) => set("targetValue", event.target.value)}
            placeholder="12"
            className="flex-1"
          />
        </div>

        <TextAreaField
          label="Notes"
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
          placeholder="One a month, fiction counts."
        />

        {error === null ? null : <p className="text-[0.875rem] text-ink">{error}</p>}
      </div>
    </Sheet>
  );
}
