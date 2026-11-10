import type { Request, Response } from "express";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "../config/auth.js";
import { loginSchema, registerSchema } from "../schemas/auth.schemas.js";
import * as authService from "../services/auth.service.js";
import { unauthorized } from "../utils/httpError.js";

// The refresh token travels in an httpOnly cookie (invisible to JavaScript, so XSS cannot steal it).
// The short-lived access token is returned in the JSON body.
const sendSession = (res: Response, status: number, session: authService.Session) => {
  res.cookie(REFRESH_COOKIE_NAME, session.refreshToken, refreshCookieOptions);
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
};

export const register = async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  sendSession(res, 201, await authService.register(input));
};

export const login = async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  sendSession(res, 200, await authService.login(input));
};

export const refresh = async (req: Request, res: Response) => {
  const rawToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof rawToken !== "string" || !rawToken) {
    throw unauthorized("Missing refresh token");
  }
  sendSession(res, 200, await authService.refresh(rawToken));
};

export const logout = async (req: Request, res: Response) => {
  const rawToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof rawToken === "string" && rawToken) {
    await authService.logout(rawToken);
  }
  // clearCookie only works if path/sameSite/secure match the options used to set it
  const { maxAge: _maxAge, ...clearOptions } = refreshCookieOptions;
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
  res.status(204).end();
};

export const me = async (req: Request, res: Response) => {
  // requireAuth guarantees req.user is set
  const user = await authService.getUserById(req.user!.id);
  res.json({ user });
};