import type { RequestHandler } from "express";
import { unauthorized } from "../utils/httpError.js";
import { verifyAccessToken } from "../utils/tokens.js";

// Protects a route: expects "Authorization: Bearer <access token>" and sets req.user
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    next(unauthorized("Missing access token"));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
};