import { createHmac, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL } from "../config/auth.js";
import { env } from "../config/env.js";
import { unauthorized } from "./httpError.js";

export type AccessTokenPayload = {
  id: string;
  username: string;
};

// ───────────── Access token: short-lived JWT, sent in the Authorization header ─────────────

export const signAccessToken = (user: AccessTokenPayload) =>
  jwt.sign({ username: user.username }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
  });

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded === "string" || !decoded.sub || typeof decoded.username !== "string") {
      throw new Error("Malformed token payload");
    }
    return { id: decoded.sub, username: decoded.username };
  } catch {
    throw unauthorized("Invalid or expired access token");
  }
};

// ───────────── Refresh token: opaque random string, only its hash is stored ─────────────

export const generateRefreshToken = () => randomBytes(48).toString("hex");

// HMAC (keyed hash) so a leaked database alone is not enough to forge valid lookups
export const hashRefreshToken = (token: string) =>
  createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");