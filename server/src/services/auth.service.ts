import type { PoolClient } from "pg";
import { REFRESH_REUSE_GRACE_MS, REFRESH_TOKEN_TTL_MS } from "../config/auth.js";
import { query, withTransaction } from "../db/pool.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.schemas.js";
import { conflict, notFound, unauthorized } from "../utils/httpError.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../utils/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../utils/tokens.js";

type UserRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  weekly_hours: string;
  is_public: boolean;
  xp: number;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  weeklyHours: number;
  isPublic: boolean;
  xp: number;
  createdAt: Date;
};

export type Session = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

// Never expose password_hash: every user leaving the service goes through this mapper
const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  username: row.username,
  email: row.email,
  displayName: row.display_name,
  bio: row.bio,
  weeklyHours: Number(row.weekly_hours),
  isPublic: row.is_public,
  xp: row.xp,
  createdAt: row.created_at,
});

const isUniqueViolation = (err: unknown): err is { code: string; constraint?: string } =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

// Creates a refresh token row and returns the raw token (only its hash is stored)
const createRefreshToken = async (userId: string, client?: PoolClient) => {
  const rawToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const sql = "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)";
  const params = [userId, hashRefreshToken(rawToken), expiresAt];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
  return rawToken;
};

const buildSession = (user: PublicUser, refreshToken: string): Session => ({
  user,
  refreshToken,
  accessToken: signAccessToken({ id: user.id, username: user.username }),
});

// ───────────────────────────── Public API ─────────────────────────────

export const register = async (input: RegisterInput): Promise<Session> => {
  const passwordHash = await hashPassword(input.password);

  let row: UserRow;
  try {
    const result = await query<UserRow>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.username, input.email, passwordHash],
    );
    row = result.rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const field = err.constraint?.includes("email") ? "email" : "username";
      throw conflict(`This ${field} is already taken`);
    }
    throw err;
  }

  const user = toPublicUser(row);
  return buildSession(user, await createRefreshToken(user.id));
};

export const login = async (input: LoginInput): Promise<Session> => {
  // citext columns make this comparison case-insensitive
  const { rows } = await query<UserRow>(
    "SELECT * FROM users WHERE username = $1 OR email = $1",
    [input.identifier],
  );
  const row = rows[0];

  // Always run a bcrypt comparison, even for unknown users, to keep response times similar
  const passwordOk = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordOk) {
    throw unauthorized("Invalid credentials");
  }

  const user = toPublicUser(row);
  return buildSession(user, await createRefreshToken(user.id));
};

type RefreshTokenRow = {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
};

// Refresh token rotation: each refresh token can be used once and is replaced by a new one.
// If an already-revoked token is presented again, it was probably stolen: revoke the whole session set.
type RefreshOutcome =
  | { kind: "rotated"; session: Session }
  | { kind: "reuse-detected"; userId: string };

export const refresh = async (rawToken: string): Promise<Session> => {
  const tokenHash = hashRefreshToken(rawToken);

  const outcome = await withTransaction(async (client): Promise<RefreshOutcome> => {
    const { rows } = await client.query<RefreshTokenRow>(
      "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE",
      [tokenHash],
    );
    const stored = rows[0];
    if (!stored) {
      throw unauthorized("Invalid refresh token");
    }

    if (stored.revoked_at) {
      const revokedAgo = Date.now() - stored.revoked_at.getTime();
      if (revokedAgo > REFRESH_REUSE_GRACE_MS) {
        // Returned instead of thrown: throwing would roll back the revocation done below
        return { kind: "reuse-detected", userId: stored.user_id };
      }
      throw unauthorized("Refresh token already used");
    }

    if (stored.expires_at.getTime() < Date.now()) {
      throw unauthorized("Refresh token expired");
    }

    const userResult = await client.query<UserRow>("SELECT * FROM users WHERE id = $1", [
      stored.user_id,
    ]);
    const userRow = userResult.rows[0];
    if (!userRow) {
      throw unauthorized("User no longer exists");
    }

    await client.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [stored.id]);

    const user = toPublicUser(userRow);
    return { kind: "rotated", session: buildSession(user, await createRefreshToken(user.id, client)) };
  });

  if (outcome.kind === "reuse-detected") {
    // A token that was already rotated came back: assume theft and sign the user out everywhere
    await query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [outcome.userId],
    );
    throw unauthorized("Refresh token already used");
  }

  return outcome.session;
};

// Idempotent: logging out with an unknown or already-revoked token is not an error
export const logout = async (rawToken: string) => {
  await query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashRefreshToken(rawToken)],
  );
};

export const getUserById = async (id: string): Promise<PublicUser> => {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  const row = rows[0];
  if (!row) {
    throw notFound("User not found");
  }
  return toPublicUser(row);
};