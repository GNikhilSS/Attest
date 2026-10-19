import { Router } from "express";
import { validateInputBody, validateInputParams } from "../lib/middleware.js";
import { AttemptCreationSchema } from "./attempts.schema.js";
import { approveAttemptRequest, createAttemptRequest, getAttemptRequest, getEmployeeAttemptRequests, getManagerAttemptRequests } from "./attempts.controller.js";

export const attemptRouter = Router();

attemptRouter.post('/', validateInputBody(AttemptCreationSchema), createAttemptRequest)

attemptRouter.get('/:attemptId/attempt', getAttemptRequest);

attemptRouter.get('/employee', getEmployeeAttemptRequests);

attemptRouter.get('/manager', getManagerAttemptRequests);

attemptRouter.post('/:attemptId/approve', approveAttemptRequest);