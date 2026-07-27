/**
 * Every collection from ARCHITECTURE.md §3.
 *
 * Import models from here so that any module touching the database also
 * registers all ten schemas — `syncIndexes()` and Mongoose's ref resolution both
 * depend on the models being defined.
 */

export { User, type UserDoc, type UserDocument, type RefreshTokenEntry } from "./user.model.js";
export { Goal, type GoalDoc, type GoalDocument } from "./goal.model.js";
export {
  Habit,
  HabitLog,
  type HabitDoc,
  type HabitDocument,
  type HabitLogDoc,
  type HabitLogDocument,
} from "./habit.model.js";
export { Checkin, type CheckinDoc, type CheckinDocument } from "./checkin.model.js";
export {
  LearningProject,
  ProjectMilestone,
  type LearningProjectDoc,
  type LearningProjectDocument,
  type ProjectMilestoneDoc,
  type ProjectMilestoneDocument,
} from "./learning-project.model.js";
export {
  Resource,
  type ResourceDoc,
  type ResourceDocument,
  type ResourceLinkDoc,
} from "./resource.model.js";
export { ImportantEvent, type EventDoc, type EventDocument } from "./event.model.js";
export {
  PushSubscription,
  type PushSubscriptionDoc,
  type PushSubscriptionDocument,
} from "./push-subscription.model.js";
export { DAY_KEY_PATTERN } from "./shared-fields.js";
