import { THEMES, type Theme } from "@tracker/shared";
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/**
 * users (ARCHITECTURE.md §3).
 *
 * `refreshTokens` is an embedded list, one entry per issued refresh token, stored
 * as a SHA-256 hash and grouped into a `family` so a detected reuse can revoke
 * every descendant of the stolen token in one update.
 */

export interface RefreshTokenEntry {
  /** sha256 of the token string. The token itself is never stored. */
  tokenHash: string;
  /** All tokens rotated from one login share a family. */
  family: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  userAgent?: string;
  createdAt?: Date;
}

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name?: string;
  timezone: string;
  theme: Theme;
  reminderTime: string;
  remindersEnabled: boolean;
  remindCheckin: boolean;
  remindGoals: boolean;
  remindEvents: boolean;
  refreshTokens: RefreshTokenEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenEntry>(
  {
    tokenHash: { type: String, required: true },
    family: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

const userSchema = new Schema<UserDoc>(
  {
    // `unique` builds the { email: 1 } unique index; no separate index needed.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by a query unless explicitly selected.
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, trim: true },
    timezone: { type: String, required: true, default: "Asia/Kolkata" },
    theme: { type: String, enum: THEMES, required: true, default: "system" },
    reminderTime: {
      type: String,
      required: true,
      default: "21:00",
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    remindersEnabled: { type: Boolean, required: true, default: true },
    remindCheckin: { type: Boolean, required: true, default: true },
    remindGoals: { type: Boolean, required: true, default: true },
    remindEvents: { type: Boolean, required: true, default: true },
    // Also never returned by default — it is credential material.
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  { timestamps: true, collection: "users" },
);

export type UserDocument = HydratedDocument<UserDoc>;
export type UserModel = Model<UserDoc>;

export const User: UserModel = model<UserDoc>("User", userSchema);
