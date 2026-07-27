import { describe, expect, it } from "vitest";

import { User } from "../models/index.js";
import { hashPassword } from "./auth.service.js";
import {
  issueTokenPair,
  listRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from "./token.service.js";

async function makeUser(email = "rotation@tracker.local"): Promise<string> {
  const user = await User.create({
    email,
    passwordHash: await hashPassword("a-long-enough-password"),
  });
  return String(user._id);
}

describe("refresh token rotation", () => {
  it("issues an access token that verifies to the user", async () => {
    const userId = await makeUser();
    const tokens = await issueTokenPair(userId);

    expect(verifyAccessToken(tokens.accessToken).sub).toBe(userId);
  });

  it("returns a new pair and revokes the presented token", async () => {
    const userId = await makeUser();
    const first = await issueTokenPair(userId);

    const second = await rotateRefreshToken(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(verifyAccessToken(second.accessToken).sub).toBe(userId);

    const stored = await listRefreshTokens(userId);
    expect(stored).toHaveLength(2);
    expect(stored.filter((entry) => entry.revoked)).toHaveLength(1);
  });

  it("keeps the rotated token in the same family", async () => {
    const userId = await makeUser();
    const first = await issueTokenPair(userId);
    await rotateRefreshToken(first.refreshToken);

    const families = new Set((await listRefreshTokens(userId)).map((entry) => entry.family));
    expect(families.size).toBe(1);
  });

  it("gives each login its own family", async () => {
    const userId = await makeUser();
    await issueTokenPair(userId);
    await issueTokenPair(userId);

    const families = new Set((await listRefreshTokens(userId)).map((entry) => entry.family));
    expect(families.size).toBe(2);
  });

  it("rotates repeatedly down a chain", async () => {
    const userId = await makeUser();
    let tokens = await issueTokenPair(userId);

    for (let index = 0; index < 4; index += 1) {
      tokens = await rotateRefreshToken(tokens.refreshToken);
    }

    const stored = await listRefreshTokens(userId);
    expect(stored).toHaveLength(5);
    expect(stored.filter((entry) => entry.revoked)).toHaveLength(4);
  });

  it("rejects a token signed for a user that no longer exists", async () => {
    const userId = await makeUser();
    const tokens = await issueTokenPair(userId);
    await User.deleteOne({ _id: userId });

    await expect(rotateRefreshToken(tokens.refreshToken)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a garbage token", async () => {
    await expect(rotateRefreshToken("not-a-jwt")).rejects.toMatchObject({ status: 401 });
  });
});

describe("reuse detection", () => {
  it("rejects a token that has already been rotated away", async () => {
    const userId = await makeUser();
    const first = await issueTokenPair(userId);
    await rotateRefreshToken(first.refreshToken);

    await expect(rotateRefreshToken(first.refreshToken)).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_REUSED",
    });
  });

  it("revokes the WHOLE family, so the thief's newer token dies too", async () => {
    const userId = await makeUser();
    const first = await issueTokenPair(userId);
    // The legitimate client rotates; `second` is now the live token.
    const second = await rotateRefreshToken(first.refreshToken);

    // An attacker replays the stolen, already-used token.
    await expect(rotateRefreshToken(first.refreshToken)).rejects.toMatchObject({
      code: "TOKEN_REUSED",
    });

    // Everything in that family is now dead — including the live one.
    const stored = await listRefreshTokens(userId);
    expect(stored.every((entry) => entry.revoked)).toBe(true);
    await expect(rotateRefreshToken(second.refreshToken)).rejects.toMatchObject({
      code: "TOKEN_REUSED",
    });
  });

  it("leaves other logins alone when one family burns", async () => {
    const userId = await makeUser();
    const phone = await issueTokenPair(userId, "phone");
    const laptop = await issueTokenPair(userId, "laptop");

    await rotateRefreshToken(phone.refreshToken);
    await expect(rotateRefreshToken(phone.refreshToken)).rejects.toMatchObject({
      code: "TOKEN_REUSED",
    });

    // The laptop's family was never touched.
    const rotated = await rotateRefreshToken(laptop.refreshToken);
    expect(verifyAccessToken(rotated.accessToken).sub).toBe(userId);
  });

  it("treats a signed-but-unknown token as a replay", async () => {
    const userId = await makeUser();
    const tokens = await issueTokenPair(userId);

    // Simulate the entry having been pruned after use.
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] } });

    await expect(rotateRefreshToken(tokens.refreshToken)).rejects.toMatchObject({
      code: "TOKEN_REUSED",
    });
  });
});

describe("logout", () => {
  it("revokes only the presented token, not the family", async () => {
    const userId = await makeUser();
    const first = await issueTokenPair(userId);
    const second = await rotateRefreshToken(first.refreshToken);

    await revokeRefreshToken(second.refreshToken);

    await expect(rotateRefreshToken(second.refreshToken)).rejects.toMatchObject({
      code: "TOKEN_REUSED",
    });
  });

  it("is silent about an expired or forged cookie", async () => {
    await expect(revokeRefreshToken("not-a-jwt")).resolves.toBeUndefined();
  });
});
