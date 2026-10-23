import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { loginRouter } from "./auth/auth.routes.js";
import { verify } from "./auth/auth.middleware.js";
import type { AuthedRequest } from "./auth/auth.types.js";
import { attemptRouter } from "./attempts/attempts.routes.js";
import { gradingRouter } from "./grading/grading.routes.js";
import { decisionsRouter } from "./decisions/decisions.routes.js";

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.get("/health", (_req, res) => {
    return res.json({ status: "ok" });
});

app.use("/auth", loginRouter);
app.use("/attempts", verify, attemptRouter);
app.use("/grading", verify, gradingRouter);
app.use("/decisions", verify, decisionsRouter);


app.get('/protected', verify, (req, res) => {
    const { employee } = req as AuthedRequest
    return res.json({ message: employee });
})


app.use("/",(err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error(err)
    return res.status(500).json({ message: "Server error" });
})

app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});