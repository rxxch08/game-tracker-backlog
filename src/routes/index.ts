import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);

// Next steps:
// apiRouter.use("/games", gamesRouter);     // step 3
// apiRouter.use("/entries", entriesRouter); // step 3
// apiRouter.use("/users", usersRouter);     // step 5