/**
 * Goal controllers (ARCHITECTURE.md §4). HTTP marshalling only — every rule lives
 * in services/goal.service.ts.
 */

import type {
  CompleteGoalInput,
  CreateGoalInput,
  ListGoalsQuery,
  UpdateGoalInput,
} from "@tracker/shared";
import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import * as goals from "../services/goal.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const data = await goals.listGoals(currentUserId(req), req.query as ListGoalsQuery);
  res.json({ data: { goals: data } });
}

export async function today(req: Request, res: Response): Promise<void> {
  const data = await goals.listTodayGoals(currentUserId(req));
  res.json({ data: { goals: data } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const data = await goals.getGoalDetail(currentUserId(req), req.params.id as string);
  res.json({ data: { goal: data } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = await goals.createGoal(currentUserId(req), req.body as CreateGoalInput);
  res.status(201).json({ data: { goal: data } });
}

export async function patch(req: Request, res: Response): Promise<void> {
  const data = await goals.updateGoal(
    currentUserId(req),
    req.params.id as string,
    req.body as UpdateGoalInput,
  );
  res.json({ data: { goal: data } });
}

export async function complete(req: Request, res: Response): Promise<void> {
  const { completed } = req.body as CompleteGoalInput;
  const data = await goals.setGoalCompleted(
    currentUserId(req),
    req.params.id as string,
    completed,
  );
  res.json({ data: { goal: data } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const data = await goals.deleteGoal(currentUserId(req), req.params.id as string);
  res.json({ data });
}
