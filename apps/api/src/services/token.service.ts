/**
 * JWT access + refresh tokens with rotation, families, and reuse detection
 * (ARCHITECTURE.md §1, §4).
 *
 * Shape of the scheme:
 *   - the access token is a short-lived bearer JWT, never stored server-side
 *   - the refresh token is a long-lived JWT whose SHA-256 hash is stored on the
 *     user, one entry per issued token
 *   - refreshing revokes the presented token and issues a new one in the SAME
 *     family
 *   - presenting an already-revoked token means someone is replaying a stolen
 *     token, so the WHOLE family is revoked: the thief and the legitimate holder
 *     both get logged out, which is the correct, safe outcome
 *
 * SHA-256 is the right hash here (unlike for passwords): a refresh token is 200+
 * bits of signed random, so there is nothing to brute-force, and lookups have to
 * be fast.
 */

import { createHash, randomUUID } from "node:crypto";

import jwt, { type SignOptions } from "jsonwebtoken";
import type { Types } from "mongoose";

import { env } from "../env.js";
import { AppError, ERROR_CODES } from "../errors.js";
import { User } from "@tracker/db";

export interface AccessTokenClaims {
  sub: string;
  type: "access";
}

export interface RefreshTokenClaims {
  sub: string;
  type: "refresh";
  /** Unique per issued token. */
  jti: string;
  /** Shared by every token rotated from one login. */
  family: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Keeps the embedded list from growing without bound on a long-lived account. */
const MAX_STORED_REFRESH_TOKENS = 20;

export function signAccessToken(userId: string): string {
  const claims: AccessTokenClaims = { sub: userId, type: "access" };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

function signRefreshToken(userId: string, family: string): { token: string; expiresAt: Date } {
  const claims: RefreshTokenClaims = {
    sub: userId,
    type: "refresh",
    jti: randomUUID(),
    family,
  };
  const token = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);

  const decoded = jwt.decode(token);
  const exp =
    typeof decoded === "object" && decoded !== null && typeof decoded.exp === "number"
      ? decoded.exp
      : null;
  if (exp === null) {
    throw AppError.internal("Refresh token was signed without an expiry");
  }
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload !== "object" || payload === null || payload.type !== "access") {
      throw AppError.unauthorized("Wrong token type");
    }
    return { sub: String(payload.sub), type: "access" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized("Access token expired", ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized("Invalid access token");
  }
}

function verifyRefreshToken(token: string): RefreshTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (
      typeof payload !== "object" ||
      payload === null ||
      payload.type !== "refresh" ||
      typeof payload.family !== "string" ||
      typeof payload.jti !== "string"
    ) {
      throw AppError.unauthorized("Wrong token type");
    }
    return {
      sub: String(payload.sub),
      type: "refresh",
      jti: payload.jti,
      family: payload.family,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized("Refresh token expired", ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized("Invalid refresh token");
  }
}

/** Drops expired and long-revoked entries, then caps the list. */
async function pruneRefreshTokens(userId: Types.ObjectId | string): Promise<void> {
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    { $pull: { refreshTokens: { expiresAt: { $lte: now } } } },
  );

  const user = await User.findById(userId).select("+refreshTokens").lean();
  const tokens = user?.refreshTokens ?? [];
  if (tokens.length > MAX_STORED_REFRESH_TOKENS) {
    const keep = tokens.slice(-MAX_STORED_REFRESH_TOKENS);
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: keep } });
  }
}

/**
 * A fresh login: a new family, and a first token inside it.
 */
export async function issueTokenPair(
  userId: Types.ObjectId | string,
  userAgent?: string,
): Promise<IssuedTokens> {
  const id = String(userId);
  const family = randomUUID();
  const { token: refreshToken, expiresAt } = signRefreshToken(id, family);

  await User.updateOne(
    { _id: userId },
    {
      $push: {
        refreshTokens: {
          tokenHash: hashToken(refreshToken),
          family,
          expiresAt,
          revokedAt: null,
          ...(userAgent === undefined ? {} : { userAgent }),
        },
      },
    },
  );
  await pruneRefreshTokens(userId);

  return {
    accessToken: signAccessToken(id),
    refreshToken,
    refreshExpiresAt: expiresAt,
  };
}

/** Revokes every token in a family. Used on detected reuse. */
async function revokeFamily(userId: string, family: string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    { $set: { "refreshTokens.$[entry].revokedAt": new Date() } },
    { arrayFilters: [{ "entry.family": family, "entry.revokedAt": null }] },
  );
}

/**
 * Rotate a refresh token.
 *
 * Throws 401 TOKEN_REUSED — after revoking the family — if the presented token
 * has already been rotated away, or is unknown to the account (which means it was
 * pruned after use, i.e. also a replay).
 */
export async function rotateRefreshToken(
  presentedToken: string,
  userAgent?: string,
): Promise<IssuedTokens> {
  const claims = verifyRefreshToken(presentedToken);
  const tokenHash = hashToken(presentedToken);

  const user = await User.findById(claims.sub).select("+refreshTokens");
  if (user === null) throw AppError.unauthorized("Invalid refresh token");

  const entry = user.refreshTokens.find((candidate) => candidate.tokenHash === tokenHash);

  if (entry === undefined) {
    // Signed by us, but not on the account: it was used and pruned, or the
    // account was wiped. Treat as a replay and burn the family.
    await revokeFamily(claims.sub, claims.family);
    throw AppError.unauthorized("Refresh token already used", ERROR_CODES.TOKEN_REUSED);
  }

  if (entry.revokedAt) {
    // The unambiguous case: this token was rotated away and someone presented it
    // again. Revoke every live token in the family.
    await revokeFamily(claims.sub, claims.family);
    throw AppError.unauthorized("Refresh token already used", ERROR_CODES.TOKEN_REUSED);
  }

  if (entry.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized("Refresh token expired", ERROR_CODES.TOKEN_EXPIRED);
  }

  const { token: nextRefresh, expiresAt } = signRefreshToken(claims.sub, claims.family);

  /**
   * Revoke first, as a compare-and-swap: the filter demands the entry still be
   * un-revoked, so two requests racing with the same token cannot both succeed —
   * the loser matches nothing and is handled as a replay below.
   *
   * This cannot be combined with the $push: Mongo refuses a positional $set and a
   * $push against the same array path in one update ("would create a conflict at
   * 'refreshTokens'"). Two writes it is — and the order is deliberate. A crash
   * between them leaves the old token dead and no new one issued, which costs a
   * re-login; the reverse order would briefly leave two live tokens.
   */
  const revoked = await User.updateOne(
    { _id: claims.sub, refreshTokens: { $elemMatch: { tokenHash, revokedAt: null } } },
    { $set: { "refreshTokens.$.revokedAt": new Date() } },
  );

  if (revoked.modifiedCount === 0) {
    await revokeFamily(claims.sub, claims.family);
    throw AppError.unauthorized("Refresh token already used", ERROR_CODES.TOKEN_REUSED);
  }

  await User.updateOne(
    { _id: claims.sub },
    {
      $push: {
        refreshTokens: {
          tokenHash: hashToken(nextRefresh),
          family: claims.family,
          expiresAt,
          revokedAt: null,
          ...(userAgent === undefined ? {} : { userAgent }),
        },
      },
    },
  );
  await pruneRefreshTokens(claims.sub);

  return {
    accessToken: signAccessToken(claims.sub),
    refreshToken: nextRefresh,
    refreshExpiresAt: expiresAt,
  };
}

/**
 * Logout: revoke just the presented token, not the family — signing out one
 * device must not sign out the others.
 */
export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  let claims: RefreshTokenClaims;
  try {
    claims = verifyRefreshToken(presentedToken);
  } catch {
    // An expired or forged cookie on logout is not worth an error: the caller is
    // already signed out.
    return;
  }

  await User.updateOne(
    { _id: claims.sub, "refreshTokens.tokenHash": hashToken(presentedToken) },
    { $set: { "refreshTokens.$.revokedAt": new Date() } },
  );
}

/** Test seam: lets a test assert on stored state without reaching into Mongoose. */
export async function listRefreshTokens(userId: string): Promise<
  Array<{ family: string; revoked: boolean }>
> {
  const user = await User.findById(userId).select("+refreshTokens").lean();
  return (user?.refreshTokens ?? []).map((entry) => ({
    family: entry.family,
    revoked: entry.revokedAt !== null && entry.revokedAt !== undefined,
  }));
}
