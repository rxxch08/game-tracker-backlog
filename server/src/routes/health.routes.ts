import { Router } from "express";
import { query } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query<{ now: Date }>("SELECT now()");
    res.json({ status: "ok", dbTime: rows[0]?.now });
  }),
);
