"use client";

import { PROJECT_STATUSES, type ProjectStatus } from "@tracker/shared";
import { useState } from "react";

import { FolderProgress, FolderTab, projectTag } from "@/components/folder/FolderTab";
import { FileTag } from "@/components/paper/FileTag";
import { HairlineRule } from "@/components/paper/HairlineRule";
import { SerifHeading } from "@/components/paper/SerifHeading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreateProject, useProjects } from "@/lib/projects";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  done: "DONE",
};

/** The drawer: a stack of folders, one per learning project. */
export function ProjectsView() {
  const [status, setStatus] = useState<ProjectStatus | undefined>("active");
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: projects, isPending, isError, refetch } = useProjects(status);

  return (
    <div className="space-y-unit-2 pb-unit-4">
      <header className="space-y-unit">
        <FileTag>PROJECTS</FileTag>
        <SerifHeading level={1}>Learning</SerifHeading>
        <HairlineRule />
      </header>

      <div
        role="radiogroup"
        aria-label="Status"
        className="flex overflow-hidden rounded-paper border-hair border-rule"
      >
        {PROJECT_STATUSES.map((option) => {
          const selected = option === status;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setStatus(option)}
              className={cn(
                "min-h-tap flex-1 border-r-hair border-rule px-2 font-mono text-tag uppercase last:border-r-0",
                "transition-colors duration-ink",
                selected ? "bg-card text-ink" : "text-ink-muted",
              )}
            >
              {STATUS_LABEL[option]}
            </button>
          );
        })}
      </div>

      {isPending ? (
        <FolderSkeleton />
      ) : isError ? (
        <div className="space-y-1.5">
          <p className="font-mono text-micro uppercase text-ink-muted">{"// couldn't load"}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-tap font-mono text-tag uppercase text-ink underline decoration-rule underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState>
          Nothing filed here yet. Start a learning project for something you want to get better at.
        </EmptyState>
      ) : (
        <ul className="space-y-unit-2">
          {projects.map((project, index) => (
            <li key={project._id}>
              <FolderTab
                tag={projectTag(project.title)}
                title={project.title}
                pastel={project.pastel}
                offsetIndex={index}
                href={`/projects/${project._id}`}
              >
                <FolderProgress
                  progress={project.progress}
                  pastel={project.pastel}
                  className="mt-2"
                />
              </FolderTab>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-[calc(var(--rhythm)*3.5)] z-20 mx-auto max-w-content px-unit">
        <Button onClick={() => setSheetOpen(true)} className="w-full">
          New project
        </Button>
      </div>

      <NewProjectSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateProject();

  async function submit(): Promise<void> {
    const trimmed = title.trim();
    if (trimmed === "") {
      setError("Give the project a title.");
      return;
    }
    try {
      await create.mutateAsync({ title: trimmed });
      setTitle("");
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create that.");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <div className="flex gap-unit">
          <Button variant="plain" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            className="flex-[2]"
            disabled={create.isPending}
          >
            {create.isPending ? "Filing…" : "Start project"}
          </Button>
        </div>
      }
    >
      <div className="space-y-unit">
        <TextField
          label="What are you learning?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Learn Japanese"
          maxLength={200}
          autoComplete="off"
        />
        <p className="text-[0.8125rem] text-ink-muted">
          A colour is assigned for you, so a stack of folders stays legible.
        </p>
        {error === null ? null : <p className="text-[0.875rem] text-ink">{error}</p>}
      </div>
    </Sheet>
  );
}

/** Folder-shaped, still — no shimmer, no layout shift when the data lands. */
function FolderSkeleton() {
  return (
    <ul className="space-y-unit-2" aria-hidden="true">
      {[0, 1].map((index) => (
        <li key={index} className="relative mt-[18px]">
          <span className="absolute -top-[18px] left-3 block h-[18px] w-24 rounded-t-[6px] border-hair border-b-0 border-rule bg-card" />
          <span className="block h-24 rounded-paper rounded-tl-none border-hair border-rule bg-card opacity-60" />
        </li>
      ))}
      <span className="sr-only">Loading projects</span>
    </ul>
  );
}
