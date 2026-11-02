import { Router } from "express";
import {
  generateAssessmentController,
  generateAndSaveController,
  saveAssessmentController,
} from "./assessment.controller.js";

export const assessmentRouter = Router();

// POST /assessment/generate
// Body: { language: string, proficiencyLevel: 1-5, topic?: string, save?: boolean }
// Query params: ?view=employee | evaluator | all | ?save=true
assessmentRouter.post("/generate", generateAssessmentController);

// POST /assessment/generate-and-save
// Body: { language: string, proficiencyLevel: 1-5, topic?: string, skillId?: number, skillName?: string }
assessmentRouter.post("/generate-and-save", generateAndSaveController);

// POST /assessment/save
// Body: { assessment: AssessmentGenerationResult, skillId?: number, skillName?: string }
assessmentRouter.post("/save", saveAssessmentController);
