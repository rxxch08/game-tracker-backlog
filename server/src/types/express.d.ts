import type { AccessTokenPayload } from "../utils/tokens.js";

declare global {
  namespace Express {
    interface Request {
      // Set by the requireAuth middleware
      user?: AccessTokenPayload;
    }
  }
}

export {};