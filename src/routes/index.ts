import { Router } from "express";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);

// Next steps:
// apiRouter.use("/auth", authRouter);       // step 2
// apiRouter.use("/games", gamesRouter);     // step 3
// apiRouter.use("/entries", entriesRouter); // step 3
// apiRouter.use("/users", usersRouter);     // step 5
