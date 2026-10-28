import "dotenv/config";
import express from "express";
import cors from "cors";
import { loginRouter } from "./auth/auth.routes.js";
import { verify } from "./auth/auth.middleware.js";
import type { AuthedRequest } from "./auth/auth.types.js";
import { attemptRouter } from "./attempts/attempts.routes.js";
import { gradingRouter } from "./grading/grading.routes.js";
import { decisionsRouter } from "./decisions/decisions.routes.js";
import { errorHandler } from "./lib/errors.js";
import { skillsRouter } from "./skills/skills.routes.js";
import './cron-jobs/expireAttempts.js';

const app = express();
app.use(cors())
app.use(express.json());

app.get("/health", (_req, res) => {
    return res.json({ status: "ok" });
});

app.use("/auth", loginRouter);
app.use("/attempts", verify, attemptRouter);
app.use("/skills", verify, skillsRouter);
app.use("/grading", verify, gradingRouter);
app.use("/decisions", verify, decisionsRouter);

app.use(errorHandler);

app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});