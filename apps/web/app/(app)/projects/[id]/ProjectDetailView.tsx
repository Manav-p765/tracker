"use client";

import { PROJECT_STATUSES, type ProjectStatus } from "@tracker/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FolderTab, projectTag } from "@/components/folder/FolderTab";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  useDeleteProject,
  useMilestoneActions,
  useProject,
  useResourceActions,
  useToggleMilestone,
  useUpdateProject,
} from "@/lib/projects";

/** One project, opened: the checklist, the derived progress, and everything filed. */
export function ProjectDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { data: project, isPending, isError, refetch } = useProject(id);

  const toggle = useToggleMilestone(id);
  const milestones = useMilestoneActions(id);
  const resources = useResourceActions(id);
  const update = useUpdateProject(id);
  const remove = useDeleteProject();

  const [newMilestone, setNewMilestone] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (isPending) {
    return <p className="font-mono text-tag uppercase text-ink-muted">…</p>;
  }
  if (isError) {
    return (
      <div className="space-y-1.5">
        <p className="text-ink">Could not open that project.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-tap font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  const addMilestone = async (): Promise<void> => {
    const title = newMilestone.trim();
    if (title === "") return;
    setNewMilestone("");
    await milestones.add.mutateAsync({ title });
  };

  const addResource = async (): Promise<void> => {
    const title = resourceTitle.trim();
    if (title === "") {
      setResourceError("Give the resource a title.");
      return;
    }
    setResourceError(null);
    try {
      await resources.add.mutateAsync({
        title,
        // Trimmed before validation — a pasted link almost always has whitespace.
        ...(resourceUrl.trim() === "" ? {} : { url: resourceUrl.trim() }),
      });
      setResourceTitle("");
      setResourceUrl("");
    } catch (caught) {
      setResourceError(
        caught instanceof ApiError ? caught.friendlyMessage : "Could not add that resource.",
      );
    }
  };

  const move = async (index: number, delta: number): Promise<void> => {
    const order = project.milestones.map((milestone) => milestone._id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const swapped = [...order];
    const [moved] = swapped.splice(index, 1);
    if (moved === undefined) return;
    swapped.splice(target, 0, moved);
    await milestones.reorder.mutateAsync(swapped);
  };

  return (
    <div className="space-y-unit-2 pb-unit-4">
      {/* The same tab stays at the top, so you never lose which file you are in. */}
      <FolderTab
        tag={projectTag(project.title)}
        title={project.title}
        pastel={project.pastel}
      >
        <div className="mt-3 flex items-end justify-between gap-unit">
          {project.progress.hasMilestones ? (
            <p className="font-heading text-[2.5rem] leading-none text-ink">
              <span data-numeric>{project.progress.percent}</span>
              <span className="text-[1.25rem] opacity-45">%</span>
            </p>
          ) : (
            <p className="font-mono text-micro uppercase text-ink-muted">no milestones yet</p>
          )}
          <p className="font-mono text-micro uppercase text-ink-muted">
            <span data-numeric>
              {project.progress.done}/{project.progress.total}
            </span>{" "}
            done
          </p>
        </div>
      </FolderTab>

      <div className="flex gap-1">
        {PROJECT_STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={project.status === option}
            onClick={() => update.mutate({ status: option as ProjectStatus })}
            className={cn(
              "min-h-tap flex-1 rounded-paper border-hair px-2 font-mono text-micro uppercase",
              project.status === option ? "border-ink bg-card text-ink" : "border-rule text-ink-muted",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <HairlineRule />

      <section className="space-y-unit">
        <SerifHeading level={3}>Milestones</SerifHeading>

        {project.milestones.length === 0 ? (
          <p className="text-[0.875rem] text-ink-muted">
            Break it into steps — each one you tick moves the progress above.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {project.milestones.map((milestone, index) => (
              <li key={milestone._id} className="flex items-center gap-2 py-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={milestone.done}
                  aria-label={
                    milestone.done ? `Un-tick ${milestone.title}` : `Tick ${milestone.title}`
                  }
                  onClick={() =>
                    toggle.mutate({ milestoneId: milestone._id, done: !milestone.done })
                  }
                  className="-m-1.5 flex min-h-tap min-w-tap items-center justify-center p-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-unit-2 w-unit-2 items-center justify-center rounded-paper border-hair border-rule"
                  >
                    {milestone.done ? (
                      <PixelGlyph glyph="x" pastel={project.pastel} scale={3} />
                    ) : null}
                  </span>
                </button>

                <span
                  className={cn(
                    "min-w-0 flex-1 text-[0.9375rem] text-ink",
                    milestone.done && "text-ink-muted line-through",
                  )}
                >
                  {milestone.title}
                </span>

                <button
                  type="button"
                  aria-label={`Move ${milestone.title} up`}
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  className="min-h-tap min-w-[2rem] font-mono text-ink-muted disabled:opacity-30"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  aria-label={`Move ${milestone.title} down`}
                  onClick={() => void move(index, 1)}
                  disabled={index === project.milestones.length - 1}
                  className="min-h-tap min-w-[2rem] font-mono text-ink-muted disabled:opacity-30"
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${milestone.title}`}
                  onClick={() => milestones.remove.mutate(milestone._id)}
                  className="min-h-tap min-w-[2rem] font-mono text-micro uppercase text-ink-muted"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <TextField
            label="Add a milestone"
            value={newMilestone}
            onChange={(event) => setNewMilestone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addMilestone();
            }}
            placeholder="Finish Hiragana"
            className="flex-1"
            maxLength={200}
            autoComplete="off"
          />
          <Button onClick={() => void addMilestone()} disabled={milestones.add.isPending}>
            Add
          </Button>
        </div>
      </section>

      <HairlineRule />

      <section className="space-y-unit">
        <SerifHeading level={3}>Resources</SerifHeading>

        {project.resources.length === 0 ? (
          <p className="text-[0.875rem] text-ink-muted">
            Nothing filed yet — links and notes about this topic live here.
          </p>
        ) : (
          <ul className="space-y-2">
            {project.resources.map((resource) => (
              <li
                key={resource._id}
                className="space-y-1 rounded-paper border-hair border-rule bg-card p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  {resource.url === undefined ? (
                    <span className="text-[0.9375rem] text-ink">{resource.title}</span>
                  ) : (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[0.9375rem] text-ink underline decoration-rule underline-offset-2"
                    >
                      {resource.title}
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${resource.title}`}
                    onClick={() => resources.remove.mutate(resource._id)}
                    className="shrink-0 font-mono text-micro uppercase text-ink-muted"
                  >
                    ✕
                  </button>
                </div>
                {resource.summary === undefined ? null : (
                  <p className="text-[0.8125rem] text-ink-muted">{resource.summary}</p>
                )}
                {resource.tags.length === 0 ? null : (
                  <p className="flex flex-wrap gap-1.5">
                    {resource.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-micro uppercase text-ink-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <TextField
            label="Add a resource"
            value={resourceTitle}
            onChange={(event) => setResourceTitle(event.target.value)}
            placeholder="Tae Kim's grammar guide"
            maxLength={300}
            autoComplete="off"
          />
          <div className="flex items-end gap-2">
            <TextField
              label="Link (optional)"
              value={resourceUrl}
              onChange={(event) => setResourceUrl(event.target.value)}
              placeholder="https://…"
              className="flex-1"
              inputMode="url"
              autoComplete="off"
            />
            <Button onClick={() => void addResource()} disabled={resources.add.isPending}>
              Add
            </Button>
          </div>
          {resourceError === null ? null : (
            <p className="text-[0.875rem] text-ink">{resourceError}</p>
          )}
        </div>
      </section>

      <HairlineRule />

      <section className="space-y-unit">
        <Button variant="plain" onClick={() => setConfirming(true)} className="w-full">
          Delete project
        </Button>

        {confirming ? (
          <div className="space-y-unit rounded-paper border-hair border-rule bg-card p-unit">
            <p className="text-[0.9375rem] text-ink">
              Delete “{project.title}”? Its{" "}
              <span data-numeric>{project.milestones.length}</span> milestone
              {project.milestones.length === 1 ? "" : "s"} and{" "}
              <span data-numeric>{project.resources.length}</span> resource
              {project.resources.length === 1 ? "" : "s"} go with it. This cannot be undone.
            </p>
            <div className="flex gap-unit">
              <Button variant="plain" onClick={() => setConfirming(false)} className="flex-1">
                Keep it
              </Button>
              <Button
                onClick={() =>
                  remove.mutate(project._id, { onSuccess: () => router.replace("/projects") })
                }
                disabled={remove.isPending}
                className="flex-1"
              >
                {remove.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
