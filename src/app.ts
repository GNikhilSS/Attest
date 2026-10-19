import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { loginRouter } from "./auth/auth.routes.js";
import { verify } from "./auth/auth.middleware.js";
import type { AuthedRequest } from "./auth/auth.types.js";
import { attemptRouter } from "./attempts/attempts.routes.js";

const app = express();
app.use(express.json());

app.use("/auth", loginRouter);
app.use("/attempts", verify, attemptRouter);


app.get('/protected', verify, (req, res) => {
    const { employee } = req as AuthedRequest
    return res.json({ message: employee });
})


app.use("/",(err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error(err)
    return res.status(500).json({ message: "Server error" });
})

app.listen(3000)