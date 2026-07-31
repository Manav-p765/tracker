/**
 * Habit controllers (ARCHITECTURE.md §4). HTTP marshalling only; the rules live in
 * services/habit.service.ts.
 */

import type {
  CreateHabitInput,
  HabitGridQuery,
  HabitLogInput,
  HabitMonthQuery,
  ListHabitsQuery,
  UpdateHabitInput,
} from "@tracker/shared";
import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import * as habits from "../services/habit.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const { includeArchived } = req.query as unknown as ListHabitsQuery;
  const data = await habits.listHabits(currentUserId(req), includeArchived);
  res.json({ data: { habits: data } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const data = await habits.createHabit(currentUserId(req), req.body as CreateHabitInput);
  res.status(201).json({ data: { habit: data } });
}

export async function patch(req: Request, res: Response): Promise<void> {
  const data = await habits.updateHabit(
    currentUserId(req),
    req.params.id as string,
    req.body as UpdateHabitInput,
  );
  res.json({ data: { habit: data } });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const data = await habits.setHabitArchived(currentUserId(req), req.params.id as string, true);
  res.json({ data: { habit: data } });
}

export async function restore(req: Request, res: Response): Promise<void> {
  const data = await habits.setHabitArchived(currentUserId(req), req.params.id as string, false);
  res.json({ data: { habit: data } });
}

export async function grid(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query as unknown as HabitGridQuery;
  const data = await habits.habitGrid(currentUserId(req), from, to);
  res.json({ data: { rows: data } });
}

export async function heatmap(req: Request, res: Response): Promise<void> {
  const { month } = req.query as unknown as HabitMonthQuery;
  const data = await habits.habitHeatmap(currentUserId(req), req.params.id as string, month);
  res.json({ data });
}

export async function streak(req: Request, res: Response): Promise<void> {
  const data = await habits.habitStreak(currentUserId(req), req.params.id as string);
  res.json({ data: { streak: data } });
}

export async function log(req: Request, res: Response): Promise<void> {
  const data = await habits.setHabitLog(currentUserId(req), req.body as HabitLogInput);
  res.json({ data: { log: data } });
}
