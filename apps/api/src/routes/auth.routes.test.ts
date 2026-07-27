import { describe, expect, it } from "vitest";

import { REFRESH_COOKIE } from "../controllers/auth.controller.js";
import {
  TEST_USER,
  readRefreshCookie,
  request,
  setCookieHeader,
  signUpAndIn,
} from "../test/helpers.js";

const cookie = (token: string): string => `${REFRESH_COOKIE}=${token}`;

describe("the auth flow end to end", () => {
  it("registers, logs in, reads me, refreshes, and logs out", async () => {
    // register
    const registered = await request()
      .post("/api/auth/register")
      .send(TEST_USER)
      .expect(201);
    expect(registered.body.data.user.email).toBe(TEST_USER.email);
    expect(registered.body.data.user).not.toHaveProperty("passwordHash");
    // Registering does not sign you in.
    expect(setCookieHeader(registered)).toBeUndefined();

    // login
    const login = await request()
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);
    const accessToken = login.body.data.accessToken as string;
    const refreshToken = readRefreshCookie(setCookieHeader(login));
    expect(accessToken).toBeTypeOf("string");
    expect(refreshToken).toBeTypeOf("string");

    // the cookie is httpOnly, lax, and scoped to /api/auth
    const cookieHeader = setCookieHeader(login)?.[0] ?? "";
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Lax");
    expect(cookieHeader).toContain("Path=/api/auth");

    // me
    const me = await request()
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.data.user.email).toBe(TEST_USER.email);
    expect(me.body.data.user.timezone).toBe(TEST_USER.timezone);

    // refresh
    const refreshed = await request()
      .post("/api/auth/refresh")
      .set("Cookie", cookie(refreshToken as string))
      .expect(200);
    const newAccess = refreshed.body.data.accessToken as string;
    const newRefresh = readRefreshCookie(setCookieHeader(refreshed));
    expect(newRefresh).not.toBe(refreshToken);

    // the new access token works
    await request().get("/api/auth/me").set("Authorization", `Bearer ${newAccess}`).expect(200);

    // logout
    await request()
      .post("/api/auth/logout")
      .set("Cookie", cookie(newRefresh as string))
      .expect(204);

    // and the refresh token is dead
    await request()
      .post("/api/auth/refresh")
      .set("Cookie", cookie(newRefresh as string))
      .expect(401);
  });

  it("rejects a replayed refresh cookie with TOKEN_REUSED and clears it", async () => {
    const session = await signUpAndIn();

    const first = await request()
      .post("/api/auth/refresh")
      .set("Cookie", cookie(session.refreshToken))
      .expect(200);
    expect(readRefreshCookie(setCookieHeader(first))).toBeTypeOf("string");

    const replay = await request()
      .post("/api/auth/refresh")
      .set("Cookie", cookie(session.refreshToken))
      .expect(401);
    expect(replay.body.error.code).toBe("TOKEN_REUSED");
    // The dead cookie is cleared so the browser stops sending it.
    expect(setCookieHeader(replay)?.[0]).toContain(`${REFRESH_COOKIE}=;`);
  });
});

describe("register", () => {
  it("refuses a duplicate email", async () => {
    await request().post("/api/auth/register").send(TEST_USER).expect(201);
    const conflict = await request().post("/api/auth/register").send(TEST_USER).expect(409);
    expect(conflict.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("lower-cases and trims the email", async () => {
    const created = await request()
      .post("/api/auth/register")
      .send({ ...TEST_USER, email: "  ME@Tracker.Local  " })
      .expect(201);
    expect(created.body.data.user.email).toBe("me@tracker.local");
  });

  it("rejects a short password with a validation envelope", async () => {
    const failed = await request()
      .post("/api/auth/register")
      .send({ email: "short@tracker.local", password: "too-short" })
      .expect(422);
    expect(failed.body.error.code).toBe("VALIDATION_FAILED");
    expect(failed.body.error.details[0].path).toBe("password");
  });

  it("rejects a timezone the runtime does not know", async () => {
    await request()
      .post("/api/auth/register")
      .send({ ...TEST_USER, email: "tz@tracker.local", timezone: "Mars/Phobos" })
      .expect(422);
  });

  it("rejects an ambiguous abbreviation, which ICU would otherwise accept", async () => {
    // Intl accepts "IST" and silently resolves it to Asia/Calcutta — but the user
    // may have meant Israel or Ireland, which would shift every day key they own.
    for (const timezone of ["IST", "EST", "GMT"]) {
      await request()
        .post("/api/auth/register")
        .send({ ...TEST_USER, email: `${timezone}@tracker.local`, timezone })
        .expect(422);
    }
  });

  it("defaults the timezone to Asia/Kolkata", async () => {
    const created = await request()
      .post("/api/auth/register")
      .send({ email: "default-tz@tracker.local", password: TEST_USER.password })
      .expect(201);
    expect(created.body.data.user.timezone).toBe("Asia/Kolkata");
  });
});

describe("login", () => {
  it("answers identically for a wrong password and an unknown email", async () => {
    await request().post("/api/auth/register").send(TEST_USER).expect(201);

    const wrongPassword = await request()
      .post("/api/auth/login")
      .send({ email: TEST_USER.email, password: "wrong-password-here" })
      .expect(401);
    const unknownEmail = await request()
      .post("/api/auth/login")
      .send({ email: "nobody@tracker.local", password: TEST_USER.password })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("me / patch me", () => {
  it("requires a bearer token", async () => {
    const anonymous = await request().get("/api/auth/me").expect(401);
    expect(anonymous.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a forged token", async () => {
    await request()
      .get("/api/auth/me")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.nope")
      .expect(401);
  });

  it("rejects a refresh token used as a bearer token", async () => {
    const session = await signUpAndIn();
    await request()
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${session.refreshToken}`)
      .expect(401);
  });

  it("patches settings and echoes the updated user", async () => {
    const session = await signUpAndIn();

    const patched = await request()
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ theme: "night", reminderTime: "22:15", remindGoals: false })
      .expect(200);

    expect(patched.body.data.user.theme).toBe("night");
    expect(patched.body.data.user.reminderTime).toBe("22:15");
    expect(patched.body.data.user.remindGoals).toBe(false);
  });

  it("rejects a malformed reminder time", async () => {
    const session = await signUpAndIn();
    await request()
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ reminderTime: "9pm" })
      .expect(422);
  });

  it("ignores unknown keys rather than writing them", async () => {
    const session = await signUpAndIn();
    const patched = await request()
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ name: "Renamed", isAdmin: true })
      .expect(200);

    expect(patched.body.data.user.name).toBe("Renamed");
    expect(patched.body.data.user).not.toHaveProperty("isAdmin");
  });
});

describe("plumbing", () => {
  it("serves healthz", async () => {
    const health = await request().get("/healthz").expect(200);
    expect(health.body.data.status).toBe("ok");
  });

  it("returns the error envelope for an unknown route", async () => {
    const missing = await request().get("/api/nope").expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("puts a request id on every response", async () => {
    const health = await request().get("/healthz").expect(200);
    expect(health.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("echoes an inbound request id so a trace can be followed", async () => {
    const health = await request()
      .get("/healthz")
      .set("X-Request-Id", "trace-me")
      .expect(200);
    expect(health.headers["x-request-id"]).toBe("trace-me");
  });

  it("refuses a refresh with no cookie at all", async () => {
    await request().post("/api/auth/refresh").expect(401);
  });
});
