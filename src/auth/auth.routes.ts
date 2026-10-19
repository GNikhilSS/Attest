import { Router } from "express";
import { login, register } from "./auth.controller.js";

export const loginRouter = Router();

loginRouter.post('/register', register);

loginRouter.post('/login', login);
