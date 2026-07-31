import { redirect } from "next/navigation";

/**
 * `/goals` has no list of its own — goals are always read through a horizon.
 *
 * It exists so there is one stable URL for "the goals screen" that does not name a
 * horizon: the goal-digest notification deep-links here, and its payload is written
 * long before anyone knows which tab makes sense to land on.
 */
export default function GoalsIndexPage() {
  redirect("/goals/daily");
}
