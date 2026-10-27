import { Router } from "express";
import { getSkills } from "./skills.controller.js";

export const skillsRouter = Router();

skillsRouter.get('/', getSkills);