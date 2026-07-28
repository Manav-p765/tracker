import { notFound } from "next/navigation";

import { HORIZONS, isHorizon } from "@/components/goals/horizon-meta";
import { GoalsHorizonView } from "./GoalsHorizonView";

/**
 * The five horizons are a closed set, so enumerate them and let the router reject
 * anything else.
 *
 * This is not just tidiness. Once the root layout's client providers flush the
 * response shell, a `notFound()` thrown here can no longer change the status code —
 * the 404 page renders inside a 200. Declaring the valid params moves the rejection
 * ahead of rendering, so /goals/nonsense is a real 404.
 */
export const dynamicParams = false;

export function generateStaticParams(): { horizon: string }[] {
  return HORIZONS.map((horizon) => ({ horizon }));
}

/**
 * Server component: validates the segment, then hands off to the client view that
 * owns the query cache and the sheet.
 */
export default async function GoalsHorizonPage({
  params,
}: {
  params: Promise<{ horizon: string }>;
}) {
  const { horizon } = await params;
  if (!isHorizon(horizon)) notFound();

  return <GoalsHorizonView horizon={horizon} />;
}
