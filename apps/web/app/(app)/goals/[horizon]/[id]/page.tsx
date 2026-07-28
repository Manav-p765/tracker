import { notFound } from "next/navigation";

import { isHorizon } from "@/components/goals/horizon-meta";
import { GoalDetailView } from "./GoalDetailView";

/**
 * Goal detail, nested under its horizon.
 *
 * ARCHITECTURE.md §7 sketched this as `goals/[id]`, but App Router cannot have two
 * differently-named dynamic segments as siblings — `goals/[horizon]` and
 * `goals/[id]` would both match `/goals/anything`. Nesting resolves that and earns
 * its keep: the horizon tab stays selected while you read a goal.
 */
export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ horizon: string; id: string }>;
}) {
  const { horizon, id } = await params;
  if (!isHorizon(horizon)) notFound();

  return <GoalDetailView id={id} />;
}
