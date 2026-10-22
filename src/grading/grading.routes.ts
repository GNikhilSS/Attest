import { Router } from "express";
import {
  runCode,
  saveDraft,
  submitAttempt,
  getGradingReport,
} from "./grading.controller.js";

export const gradingRouter = Router();

gradingRouter.post(
  "/:attemptId/questions/:questionId/run",
  runCode,
);

gradingRouter.put(
  "/:attemptId/questions/:questionId/draft",
  saveDraft,
);

gradingRouter.post(
  "/:attemptId/submit",
  submitAttempt,
);

gradingRouter.get(
  "/:attemptId/report",
  getGradingReport,
);
