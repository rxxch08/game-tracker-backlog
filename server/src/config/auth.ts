import type { CookieOptions } from "express";
import { env } from "./env.js";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A refresh token revoked less than this long ago is treated as a harmless race
// (e.g. two tabs refreshing at once), not as a stolen token being replayed.
export const REFRESH_REUSE_GRACE_MS = 10_000;

export const BCRYPT_ROUNDS = 12;

export const REFRESH_COOKIE_NAME = "refresh_token";

const isProduction = env.NODE_ENV === "production";

export const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // The frontend and the API live on different domains in production (e.g. Vercel + Render),
  // so the cookie must be allowed on cross-site requests. "none" requires "secure".
  sameSite: isProduction ? "none" : "lax",
  // The browser only sends the cookie to the auth routes
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_MS,
};