/**
 * Auth service (ARCHITECTURE.md §4, §10).
 *
 * Passwords are hashed with argon2id — the memory-hard variant, which is what
 * makes a stolen hash expensive to attack. Controllers never touch Mongoose
 * directly; the rules live here.
 */

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import type { RegisterInput, UpdateMeInput, User as UserDto } from "@tracker/shared";

import { AppError, ERROR_CODES } from "../errors.js";
import { User, type UserDoc } from "../models/index.js";

/**
 * argon2id, tuned for an interactive login on modest hardware: 19 MiB, 2 passes,
 * 1 lane — the OWASP baseline.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (password: string): Promise<string> =>
  argonHash(password, ARGON_OPTIONS);

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    // A malformed stored hash must read as "wrong password", never as a 500.
    return false;
  }
}

/** Everything the client is allowed to see about a user. Never the hash. */
export function toUserDto(user: Pick<UserDoc, keyof UserDoc>): UserDto {
  return {
    _id: String(user._id),
    email: user.email,
    ...(user.name === undefined ? {} : { name: user.name }),
    timezone: user.timezone,
    theme: user.theme,
    reminderTime: user.reminderTime,
    remindersEnabled: user.remindersEnabled,
    remindCheckin: user.remindCheckin,
    remindGoals: user.remindGoals,
    remindEvents: user.remindEvents,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function registerUser(input: RegisterInput): Promise<UserDto> {
  const existing = await User.exists({ email: input.email });
  if (existing !== null) {
    throw AppError.conflict("That email is already registered", ERROR_CODES.EMAIL_TAKEN);
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const created = await User.create({
      email: input.email,
      passwordHash,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    });
    return toUserDto(created.toObject());
  } catch (error) {
    // The unique index is the real guard — the exists() check above only makes the
    // common case a clean 409 instead of a race.
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      throw AppError.conflict("That email is already registered", ERROR_CODES.EMAIL_TAKEN);
    }
    throw error;
  }
}

/**
 * Verifies credentials. Returns the user document id on success.
 *
 * Always answers with the same error for an unknown email and a wrong password,
 * so the response cannot be used to enumerate accounts.
 */
export async function verifyCredentials(email: string, password: string): Promise<UserDoc> {
  const user = await User.findOne({ email }).select("+passwordHash").lean();
  if (user === null) {
    // Spend comparable time on a miss so timing does not leak existence.
    await hashPassword(password);
    throw AppError.unauthorized("Email or password is incorrect", ERROR_CODES.INVALID_CREDENTIALS);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    throw AppError.unauthorized("Email or password is incorrect", ERROR_CODES.INVALID_CREDENTIALS);
  }

  return user;
}

export async function getUserById(userId: string): Promise<UserDto> {
  const user = await User.findById(userId).lean();
  if (user === null) throw AppError.unauthorized("Account no longer exists");
  return toUserDto(user);
}

export async function updateUser(userId: string, patch: UpdateMeInput): Promise<UserDto> {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();
  if (updated === null) throw AppError.unauthorized("Account no longer exists");
  return toUserDto(updated);
}
