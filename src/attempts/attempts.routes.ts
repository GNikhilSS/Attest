import { Router } from "express";
import { validateInputBody } from "../lib/middleware.js";
import { AttemptCreationSchema } from "./attempts.schema.js";
import { approveAttemptRequest, createAttemptRequest, getAttemptRequest, getEmployeeAttemptRequests, getManagerAttemptRequests, removeAttemptRequest, startAttemptExam, viewAttemptExam, expireOverdueAttempts, recordAttemptEvent } from "./attempts.controller.js";

export const attemptRouter = Router();

attemptRouter.post('/', validateInputBody(AttemptCreationSchema), createAttemptRequest);

attemptRouter.get('/:attemptId/attempt', getAttemptRequest);

attemptRouter.delete('/:attemptId', removeAttemptRequest);

attemptRouter.get('/employee', getEmployeeAttemptRequests);

attemptRouter.get('/manager', getManagerAttemptRequests);

attemptRouter.post('/expire-overdue', expireOverdueAttempts);

attemptRouter.post('/:attemptId/approve', approveAttemptRequest);

attemptRouter.post('/:attemptId/start', startAttemptExam);

attemptRouter.get('/:attemptId/view', viewAttemptExam);

attemptRouter.post('/:attemptId/events', recordAttemptEvent);
