import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { REFRESH_COOKIE_NAME } from "../config/auth.js";
import { pool, query } from "../db/pool.js";
import { hashRefreshToken } from "../utils/tokens.js";

const app = createApp();

// Unique suffix so test users never collide with real data or with previous runs
const suffix = Date.now().toString(36);
const credentials = {
  username: `tester_${suffix}`,
  email: `tester_${suffix}@example.com`,
  password: "correct-horse-battery",
};

// Extracts the raw refresh token value from a Set-Cookie header
const getRefreshToken = (res: request.Response) => {
  const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  return cookie?.split(";")[0]?.split("=")[1];
};

const withRefreshCookie = (token: string) => `${REFRESH_COOKIE_NAME}=${token}`;

describe("auth API", () => {
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    await query("DELETE FROM users WHERE username LIKE $1", [`tester_${suffix}%`]);
  });

  afterAll(async () => {
    await query("DELETE FROM users WHERE username LIKE $1", [`tester_${suffix}%`]);
    await pool.end();
  });

  describe("POST /api/auth/register", () => {
    it("creates a user, returns an access token and sets an httpOnly refresh cookie", async () => {
      const res = await request(app).post("/api/auth/register").send(credentials);

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        username: credentials.username,
        email: credentials.email,
        xp: 0,
      });
      expect(res.body.accessToken).toEqual(expect.any(String));

      // The password hash must never leave the API
      expect(JSON.stringify(res.body)).not.toContain("password");

      const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Path=/api/auth");

      accessToken = res.body.accessToken;
      refreshToken = getRefreshToken(res)!;
      expect(refreshToken).toBeTruthy();
    });

    it("stores only a hash of the refresh token", async () => {
      const { rows } = await query("SELECT token_hash FROM refresh_tokens WHERE token_hash = $1", [
        hashRefreshToken(refreshToken),
      ]);
      expect(rows).toHaveLength(1);

      const raw = await query("SELECT 1 FROM refresh_tokens WHERE token_hash = $1", [refreshToken]);
      expect(raw.rows).toHaveLength(0);
    });

    it("rejects a duplicate username with 409", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ ...credentials, email: `other_${suffix}@example.com` });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/username/);
    });

    it("rejects a duplicate email with 409, case-insensitively", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          ...credentials,
          username: `tester_${suffix}_b`,
          email: credentials.email.toUpperCase(),
        });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email/);
    });

    it.each([
      ["a too-short username", { username: "ab" }],
      ["an invalid email", { email: "not-an-email" }],
      ["a too-short password", { password: "short" }],
      ["a password over 72 bytes", { password: "x".repeat(73) }],
    ])("rejects %s with 400", async (_label, override) => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ ...credentials, username: `tester_${suffix}_c`, ...override });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("logs in with the username", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: credentials.username, password: credentials.password });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("logs in with the email, case-insensitively", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ identifier: credentials.email.toUpperCase(), password: credentials.password });
      expect(res.status).toBe(200);
    });

    it("returns the same 401 for a wrong password and for an unknown user", async () => {
      const wrongPassword = await request(app)
        .post("/api/auth/login")
        .send({ identifier: credentials.username, password: "wrong-password" });
      const unknownUser = await request(app)
        .post("/api/auth/login")
        .send({ identifier: `nobody_${suffix}`, password: "whatever-password" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(wrongPassword.body.error).toBe(unknownUser.body.error);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns the current user with a valid access token", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(credentials.username);
    });

    it("rejects a missing token with 401", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });

    it("rejects a tampered token with 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}x`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("rotates the refresh token and the old one stops working", async () => {
      const first = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(first.status).toBe(200);
      expect(first.body.accessToken).toEqual(expect.any(String));

      const rotated = getRefreshToken(first)!;
      expect(rotated).toBeTruthy();
      expect(rotated).not.toBe(refreshToken);

      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(replay.status).toBe(401);

      refreshToken = rotated;
    });

    it("rejects a request without a cookie with 401", async () => {
      const res = await request(app).post("/api/auth/refresh");
      expect(res.status).toBe(401);
    });

    it("rejects an unknown token with 401", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie("0".repeat(96)));
      expect(res.status).toBe(401);
    });

    it("rejects an expired token with 401", async () => {
      await query("UPDATE refresh_tokens SET expires_at = now() - interval '1 day' WHERE token_hash = $1", [
        hashRefreshToken(refreshToken),
      ]);
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired/);

      await query("UPDATE refresh_tokens SET expires_at = now() + interval '1 day' WHERE token_hash = $1", [
        hashRefreshToken(refreshToken),
      ]);
    });

    it("revokes every session when an old token is replayed after the grace period", async () => {
      // Rotate once, then pretend the old token was revoked long ago
      const rotated = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(rotated.status).toBe(200);
      const newest = getRefreshToken(rotated)!;

      await query(
        "UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE token_hash = $1",
        [hashRefreshToken(refreshToken)],
      );

      // The attacker replays the stolen (already used) token...
      const replay = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(replay.status).toBe(401);

      // ...so even the legitimate newest token is now dead
      const legit = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(newest));
      expect(legit.status).toBe(401);
    });

    it("does not revoke other sessions on a near-simultaneous double refresh", async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: credentials.username, password: credentials.password });
      const token = getRefreshToken(login)!;

      const [a, b] = await Promise.all([
        request(app).post("/api/auth/refresh").set("Cookie", withRefreshCookie(token)),
        request(app).post("/api/auth/refresh").set("Cookie", withRefreshCookie(token)),
      ]);

      // Exactly one wins; the loser is rejected but the winner's new token stays valid
      expect([a.status, b.status].sort()).toEqual([200, 401]);
      const winner = a.status === 200 ? a : b;
      const next = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(getRefreshToken(winner)!));
      expect(next.status).toBe(200);

      refreshToken = getRefreshToken(next)!;
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revokes the refresh token and clears the cookie", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(res.status).toBe(204);

      const cleared = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(cleared).toContain(`${REFRESH_COOKIE_NAME}=;`);

      const after = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", withRefreshCookie(refreshToken));
      expect(after.status).toBe(401);
    });

    it("is idempotent without a cookie", async () => {
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(204);
    });
  });
});