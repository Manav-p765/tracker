"use client";

import { FolderProgress, projectTag } from "@/components/folder/FolderTab";
import { useProjects } from "@/lib/projects";
import { BentoCard } from "./BentoCard";
import { CardEmpty, CardError, CardSkeleton } from "./CardStates";

/**
 * The learning project you are currently on (DESIGN.md §5a).
 *
 * Shows the most recently touched ACTIVE project — the list comes back sorted by
 * updatedAt, so "what I was last working on" needs no extra state to track.
 *
 * The folder tab is drawn inline rather than reusing FolderTab, because the bento
 * card already owns its own tag row and nesting one tab inside another would read
 * as two files rather than one.
 */
export function ProjectCard() {
  const { data: projects, isPending, isError, refetch } = useProjects("active");
  const project = projects?.[0];

  return (
    <BentoCard
      tag={project === undefined ? "PROJECT" : projectTag(project.title)}
      tone="powder"
      span={3}
      index="06"
      {...(project === undefined ? {} : { href: `/projects/${project._id}` })}
      className="pt-5"
    >
      {/* The tab, protruding from the card's top edge. */}
      <span
        aria-hidden="true"
        className="absolute left-3 top-0 h-2 w-14 border-hair border-b-0 border-rule bg-powder-wash"
        style={{ borderRadius: "var(--radius-tab)" }}
      />

      {isPending ? (
        <CardSkeleton />
      ) : isError ? (
        <CardError onRetry={() => void refetch()} />
      ) : project === undefined ? (
        <CardEmpty href="/projects">
          Start a learning project for something you want to get better at.
        </CardEmpty>
      ) : (
        <>
          <p className="mt-1 font-heading text-[1.125rem] leading-tight text-ink">
            {project.title}
          </p>
          <FolderProgress
            progress={project.progress}
            pastel={project.pastel}
            className="mt-auto"
          />
        </>
      )}
    </BentoCard>
  );
}
