/**
 * Check-in controllers (ARCHITECTURE.md §4). HTTP marshalling only.
 */

import type { CheckinMonthQuery, UpsertCheckinInput } from "@tracker/shared";
import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import * as checkins from "../services/checkin.service.js";

export async function upsert(req: Request, res: Response): Promise<void> {
  const data = await checkins.upsertCheckin(currentUserId(req), req.body as UpsertCheckinInput);
  res.json({ data: { checkin: data } });
}

export async function today(req: Request, res: Response): Promise<void> {
  const data = await checkins.getCheckin(currentUserId(req));
  res.json({ data: { checkin: data } });
}

export async function byDate(req: Request, res: Response): Promise<void> {
  const data = await checkins.getCheckin(currentUserId(req), req.params.date as string);
  res.json({ data: { checkin: data } });
}

export async function month(req: Request, res: Response): Promise<void> {
  const { month: monthKey } = req.query as unknown as CheckinMonthQuery;
  const data = await checkins.listCheckins(currentUserId(req), monthKey);
  res.json({ data: { checkins: data } });
}
