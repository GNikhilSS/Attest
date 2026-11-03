import "dotenv/config";
import express from "express";
import cors from "cors";
import { loginRouter } from "./auth/auth.routes.js";
import { verify } from "./auth/auth.middleware.js";
import { attemptRouter } from "./attempts/attempts.routes.js";
import { gradingRouter } from "./grading/grading.routes.js";
import { decisionsRouter } from "./decisions/decisions.routes.js";
import { errorHandler } from "./lib/errors.js";
import { skillsRouter } from "./skills/skills.routes.js";
import { assessmentRouter } from "./assessment/assessment.routes.js";
import './cron-jobs/expireAttempts.js';
import { responseInterceptor } from "./lib/middleware/logger.js";
import cookieParser from "cookie-parser";
import { employeesRouter } from "./employees/employees.routes.js";

const app = express();
app.use(cors({
    origin: ['http://localhost:4200'],
    credentials: true,
    exposedHeaders: ["Authorization"],
    allowedHeaders: ["Content-Type", "Authorization"]
}))
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
    return res.json({ status: "ok" });
});

app.use(responseInterceptor);
app.use("/auth", loginRouter);
app.use("/attempts", verify, attemptRouter);
app.use("/skills", verify, skillsRouter);
app.use("/grading", verify, gradingRouter);
app.use("/decisions", verify, decisionsRouter);
app.use("/assessment", assessmentRouter);
app.use("/employees", verify, employeesRouter);

app.use(errorHandler);

app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});
