import { Router } from "express";
import { login, refresh, register } from "./auth.controller.js";
import { validateInputBody } from "../lib/middleware/validations.js";
import { LoginSchema, RegisterSchema } from "./auth.schema.js";

export const loginRouter = Router();

loginRouter.post('/register', validateInputBody(RegisterSchema), register);

loginRouter.post('/login', validateInputBody(LoginSchema), login);

loginRouter.post('/refresh', refresh);
