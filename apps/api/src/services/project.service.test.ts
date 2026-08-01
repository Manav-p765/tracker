import { LearningProject, ProjectMilestone, Resource, User } from "@tracker/db";
import { beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "./auth.service.js";
import {
  addMilestone,
  addResource,
  createProject,
  deleteMilestone,
  deleteProject,
  deleteResource,
  getProject,
  listProjects,
  progressFrom,
  reorderMilestones,
  updateMilestone,
  updateProject,
  updateResource,
} from "./project.service.js";

const EVENING_UTC = new Date("2026-07-26T18:30:00.000Z");
const TODAY_IST = "2026-07-27";

let userId: string;
let otherId: string;

async function makeUser(email: string): Promise<string> {
  const user = await User.create({
    email,
    passwordHash: await hashPassword("a-long-enough-password"),
    timezone: "Asia/Kolkata",
  });
  return String(user._id);
}

beforeEach(async () => {
  userId = await makeUser("projects@tracker.local");
  otherId = await makeUser("other-projects@tracker.local");
});

const newProject = (title = "Learn Japanese", owner = userId) =>
  createProject(owner, { title });

describe("progressFrom — the derivation itself", () => {
  it("is an honest zero with no milestones, never NaN", () => {
    const progress = progressFrom(0, 0);
    expect(progress).toEqual({ done: 0, total: 0, percent: 0, hasMilestones: false });
    expect(Number.isNaN(progress.percent)).toBe(false);
  });

  it("computes a partial percentage", () => {
    expect(progressFrom(7, 20)).toEqual({
      done: 7,
      total: 20,
      percent: 35,
      hasMilestones: true,
    });
  });

  it("rounds to the nearest whole percent", () => {
    expect(progressFrom(1, 3).percent).toBe(33);
    expect(progressFrom(2, 3).percent).toBe(67);
  });

  it("reaches exactly 100 when everything is done", () => {
    expect(progressFrom(4, 4).percent).toBe(100);
  });

  it("distinguishes 0 of 5 from no milestones at all", () => {
    // Both read 0%, but only one of them means "nothing planned yet".
    expect(progressFrom(0, 5)).toMatchObject({ percent: 0, hasMilestones: true });
    expect(progressFrom(0, 0)).toMatchObject({ percent: 0, hasMilestones: false });
  });
});

describe("derived progress, end to end", () => {
  it("starts at zero with no milestones", async () => {
    const project = await newProject();
    expect(project.progress).toEqual({ done: 0, total: 0, percent: 0, hasMilestones: false });
  });

  it("moves as milestones are ticked", async () => {
    const project = await newProject();
    const first = await addMilestone(userId, project._id, { title: "Hiragana" });
    await addMilestone(userId, project._id, { title: "Katakana" });
    await addMilestone(userId, project._id, { title: "Kanji" });
    await addMilestone(userId, project._id, { title: "N5 grammar" });

    expect((await getProject(userId, project._id)).progress).toMatchObject({
      done: 0,
      total: 4,
      percent: 0,
      hasMilestones: true,
    });

    await updateMilestone(userId, first._id, { done: true }, EVENING_UTC);
    expect((await getProject(userId, project._id)).progress).toMatchObject({
      done: 1,
      total: 4,
      percent: 25,
    });
  });

  it("reaches 100% when every milestone is done", async () => {
    const project = await newProject();
    const a = await addMilestone(userId, project._id, { title: "One" });
    const b = await addMilestone(userId, project._id, { title: "Two" });
    await updateMilestone(userId, a._id, { done: true }, EVENING_UTC);
    await updateMilestone(userId, b._id, { done: true }, EVENING_UTC);

    expect((await getProject(userId, project._id)).progress.percent).toBe(100);
  });

  it("falls back when a milestone is un-ticked", async () => {
    const project = await newProject();
    const milestone = await addMilestone(userId, project._id, { title: "One" });
    await updateMilestone(userId, milestone._id, { done: true }, EVENING_UTC);
    await updateMilestone(userId, milestone._id, { done: false }, EVENING_UTC);

    expect((await getProject(userId, project._id)).progress).toMatchObject({
      done: 0,
      total: 1,
      percent: 0,
    });
  });

  it("returns to 'no milestones' when the last one is deleted", async () => {
    const project = await newProject();
    const milestone = await addMilestone(userId, project._id, { title: "Only" });
    await deleteMilestone(userId, milestone._id);

    expect((await getProject(userId, project._id)).progress.hasMilestones).toBe(false);
  });

  it("is never stored on the project document", async () => {
    const project = await newProject();
    await addMilestone(userId, project._id, { title: "One" });

    const raw = await LearningProject.findById(project._id).lean();
    // The whole point: there is no column to go stale.
    expect(raw === null ? undefined : (raw as Record<string, unknown>).progress).toBeUndefined();
  });

  it("stamps the completion date in the user's timezone", async () => {
    const project = await newProject();
    const milestone = await addMilestone(userId, project._id, { title: "One" });
    const done = await updateMilestone(userId, milestone._id, { done: true }, EVENING_UTC);

    expect(done.done).toBe(true);
    // 18:30 UTC is already the 27th in Asia/Kolkata.
    expect(done.completedDate).toBe(TODAY_IST);
  });

  it("computes each project's progress independently in a list", async () => {
    const first = await newProject("Japanese");
    const second = await newProject("3D modelling");
    const a = await addMilestone(userId, first._id, { title: "One" });
    await addMilestone(userId, first._id, { title: "Two" });
    await addMilestone(userId, second._id, { title: "Only" });
    await updateMilestone(userId, a._id, { done: true }, EVENING_UTC);

    const projects = await listProjects(userId);
    const byTitle = new Map(projects.map((project) => [project.title, project.progress]));

    expect(byTitle.get("Japanese")).toMatchObject({ done: 1, total: 2, percent: 50 });
    expect(byTitle.get("3D modelling")).toMatchObject({ done: 0, total: 1, percent: 0 });
  });
});

describe("projects CRUD", () => {
  it("assigns pastels round-robin so a stack is never one colour", async () => {
    const pastels: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      pastels.push((await newProject(`Project ${index}`)).pastel);
    }
    expect(pastels.slice(0, 5)).toEqual(["sage", "clay", "powder", "ochre", "lilac"]);
    // Sixth wraps back round.
    expect(pastels[5]).toBe("sage");
  });

  it("filters by status", async () => {
    const active = await newProject("Active one");
    const paused = await newProject("Paused one");
    await updateProject(userId, paused._id, { status: "paused" });

    expect((await listProjects(userId, "active")).map((project) => project._id)).toEqual([
      active._id,
    ]);
    expect((await listProjects(userId, "paused")).map((project) => project._id)).toEqual([
      paused._id,
    ]);
  });

  it("updates title, status and colour", async () => {
    const project = await newProject();
    const updated = await updateProject(userId, project._id, {
      title: "Learn Japanese properly",
      status: "done",
      pastel: "lilac",
    });

    expect(updated).toMatchObject({
      title: "Learn Japanese properly",
      status: "done",
      pastel: "lilac",
    });
  });

  it("never touches another user's project", async () => {
    const mine = await newProject();
    await expect(getProject(otherId, mine._id)).rejects.toMatchObject({ status: 404 });
    await expect(updateProject(otherId, mine._id, { title: "Theirs" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteProject(otherId, mine._id)).rejects.toMatchObject({ status: 404 });
  });

  it("never lists another user's projects", async () => {
    await newProject();
    expect(await listProjects(otherId)).toEqual([]);
  });
});

describe("cascade delete", () => {
  it("removes the project's milestones AND its resources", async () => {
    const project = await newProject();
    await addMilestone(userId, project._id, { title: "One" });
    await addMilestone(userId, project._id, { title: "Two" });
    await addResource(userId, project._id, { title: "Tae Kim", url: "https://example.com" });

    const result = await deleteProject(userId, project._id);

    expect(result).toEqual({ milestones: 2, resources: 1 });
    // No orphans: a milestone whose folder is gone would never be shown again.
    expect(await ProjectMilestone.countDocuments({ projectId: project._id })).toBe(0);
    expect(await Resource.countDocuments({ projectId: project._id })).toBe(0);
    expect(await LearningProject.countDocuments({ _id: project._id })).toBe(0);
  });

  it("leaves another project's contents alone", async () => {
    const doomed = await newProject("Doomed");
    const kept = await newProject("Kept");
    await addMilestone(userId, doomed._id, { title: "Goes" });
    await addMilestone(userId, kept._id, { title: "Stays" });
    await addResource(userId, kept._id, { title: "Stays too" });

    await deleteProject(userId, doomed._id);

    expect(await ProjectMilestone.countDocuments({ projectId: kept._id })).toBe(1);
    expect(await Resource.countDocuments({ projectId: kept._id })).toBe(1);
  });

  it("does not delete loose Vault resources", async () => {
    const project = await newProject();
    // A resource with no project — 3.2's territory. It must survive.
    await Resource.create({
      userId: project.userId,
      title: "Loose vault item",
      source: "vault-paste",
      projectId: null,
      tags: [],
      links: [],
    });

    await deleteProject(userId, project._id);

    expect(await Resource.countDocuments({ userId: project.userId, projectId: null })).toBe(1);
  });

  it("reports zero counts for an empty project", async () => {
    const project = await newProject();
    expect(await deleteProject(userId, project._id)).toEqual({ milestones: 0, resources: 0 });
  });
});

describe("milestone ordering", () => {
  it("appends new milestones to the end", async () => {
    const project = await newProject();
    await addMilestone(userId, project._id, { title: "First" });
    await addMilestone(userId, project._id, { title: "Second" });
    await addMilestone(userId, project._id, { title: "Third" });

    const { milestones } = await getProject(userId, project._id);
    expect(milestones.map((milestone) => milestone.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(milestones.map((milestone) => milestone.sortOrder)).toEqual([0, 1, 2]);
  });

  it("reorders to exactly the list it was given", async () => {
    const project = await newProject();
    const a = await addMilestone(userId, project._id, { title: "A" });
    const b = await addMilestone(userId, project._id, { title: "B" });
    const c = await addMilestone(userId, project._id, { title: "C" });

    const reordered = await reorderMilestones(userId, project._id, {
      milestoneIds: [c._id, a._id, b._id],
    });

    expect(reordered.map((milestone) => milestone.title)).toEqual(["C", "A", "B"]);
    expect(reordered.map((milestone) => milestone.sortOrder)).toEqual([0, 1, 2]);
  });

  it("is stable — reordering twice to the same list changes nothing", async () => {
    const project = await newProject();
    const a = await addMilestone(userId, project._id, { title: "A" });
    const b = await addMilestone(userId, project._id, { title: "B" });

    const first = await reorderMilestones(userId, project._id, { milestoneIds: [b._id, a._id] });
    const second = await reorderMilestones(userId, project._id, { milestoneIds: [b._id, a._id] });

    expect(first.map((milestone) => milestone._id)).toEqual(
      second.map((milestone) => milestone._id),
    );
    expect(second.map((milestone) => milestone.sortOrder)).toEqual([0, 1]);
  });

  it("ignores ids that do not belong to the project", async () => {
    const project = await newProject();
    const other = await newProject("Other");
    const mine = await addMilestone(userId, project._id, { title: "Mine" });
    const theirs = await addMilestone(userId, other._id, { title: "Theirs" });

    const reordered = await reorderMilestones(userId, project._id, {
      milestoneIds: [theirs._id, mine._id],
    });

    // The foreign id is dropped, not trusted into this project's ordering.
    expect(reordered.map((milestone) => milestone._id)).toEqual([mine._id]);
    const otherDetail = await getProject(userId, other._id);
    expect(otherDetail.milestones.map((milestone) => milestone._id)).toEqual([theirs._id]);
  });

  it("preserves done state through a reorder", async () => {
    const project = await newProject();
    const a = await addMilestone(userId, project._id, { title: "A" });
    const b = await addMilestone(userId, project._id, { title: "B" });
    await updateMilestone(userId, a._id, { done: true }, EVENING_UTC);

    const reordered = await reorderMilestones(userId, project._id, {
      milestoneIds: [b._id, a._id],
    });

    expect(reordered.find((milestone) => milestone._id === a._id)?.done).toBe(true);
    expect((await getProject(userId, project._id)).progress.percent).toBe(50);
  });

  it("refuses a milestone belonging to another user", async () => {
    const mine = await newProject();
    const milestone = await addMilestone(userId, mine._id, { title: "Mine" });
    await expect(
      updateMilestone(otherId, milestone._id, { done: true }, EVENING_UTC),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("project resources", () => {
  it("attaches a resource with a link and tags", async () => {
    const project = await newProject();
    const resource = await addResource(userId, project._id, {
      title: "Tae Kim's guide",
      url: "https://guidetojapanese.org",
      summary: "The grammar guide everyone recommends.",
      tags: ["Grammar", "FREE"],
    });

    expect(resource).toMatchObject({
      title: "Tae Kim's guide",
      url: "https://guidetojapanese.org",
      projectId: project._id,
      source: "project",
    });
    // Tags are lowercased by the model so filtering is consistent.
    expect(resource.tags).toEqual(["grammar", "free"]);
  });

  it("allows a resource with no url — a note is a resource too", async () => {
    const project = await newProject();
    const resource = await addResource(userId, project._id, {
      title: "Ask about pitch accent",
      summary: "Worth finding a proper reference for this.",
    });
    expect(resource.url).toBeUndefined();
  });

  it("appears on the project detail", async () => {
    const project = await newProject();
    await addResource(userId, project._id, { title: "One" });
    await addResource(userId, project._id, { title: "Two" });

    expect((await getProject(userId, project._id)).resources).toHaveLength(2);
  });

  it("edits and detaches", async () => {
    const project = await newProject();
    const resource = await addResource(userId, project._id, { title: "Draft" });

    const updated = await updateResource(userId, resource._id, {
      title: "Final",
      tags: ["kanji"],
    });
    expect(updated).toMatchObject({ title: "Final", tags: ["kanji"] });

    expect(await deleteResource(userId, resource._id)).toEqual({ removed: 1 });
    expect((await getProject(userId, project._id)).resources).toEqual([]);
  });

  it("clears a url with null rather than storing an empty string", async () => {
    const project = await newProject();
    const resource = await addResource(userId, project._id, {
      title: "One",
      url: "https://example.com",
    });

    const cleared = await updateResource(userId, resource._id, { url: null });
    expect(cleared.url).toBeUndefined();
  });

  it("refuses to attach to another user's project", async () => {
    const mine = await newProject();
    await expect(
      addResource(otherId, mine._id, { title: "Sneaky" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
