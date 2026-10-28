//DONE
// - Routes: queue, attempt details, and decision, each with a valid-id check and a decision value check.
// - Service checks the attempt exists (404), the caller manages the employee (403), and the status is GRADED (409) before recording.
// - Rejection requires a reason (400), checked in the service before the transition.
// - The decision goes through transitionAttempt, which writes status, decision, and an event together.
// - The details view excludes draft submissions and returns the latest final answer per question.

// NOT DONE
// - getManagerDecisionQueue does not take a 403 path; it’s filtered by manager, which is fine, but it returns a list, not an error, so an unknown manager just gets an empty queue.
// - Ownership and status checks run in the service before the transition, and the transition checks them again. Keep one place for the rule or accept the duplication on purpose.
// - recordDecision reads the attempt, then transitions. Another request can change it in between; the transition’s compare-and-set catches it, but the error will surface as CONCURRENT_TRANSITION (409), not the 409 message above. Map it once in the handler.
// - Error objects are returned instead of thrown. Mixed with the global error handler, that’s two error styles. Pick one.
// - The details view returns events in full to the manager. Fine for review, but confirm that events with payloads containing sensitive data are acceptable to show.
// - The decision message uses decision.toLowerCase(), which is cosmetic; a fixed response shape is safer for the frontend.
// - The route file also imports Decision for validation; prefer a Zod schema, matching the attempts routes.
// - No test for the cross-manager 403 path in the routes yet.
// - The GET details route returns 403 for another manager’s attempt but 404 for missing, which is consistent with the reads elsewhere only if we keep the policy decided earlier.

import { Router, type Request, type Response } from "express";
import type { AuthedRequest } from "../auth/auth.types.js";
import { Decision } from "../../generated/prisma/client.js";
import {
  getManagerDecisionQueue,
  getAttemptDecisionDetails,
  recordDecision,
} from "./decisions.service.js";

export const decisionsRouter = Router();

// GET /decisions/queue - View all graded attempts waiting for manager review
decisionsRouter.get("/queue", async (req: Request, res: Response) => {
  const managerId = (req as AuthedRequest).employee?.employeeId;
  const queue = await getManagerDecisionQueue(managerId);
  return res.status(200).json({ queue });
});

// GET /decisions/:attemptId - View complete attempt details, grading report, and events
decisionsRouter.get("/:attemptId", async (req: Request, res: Response) => {
  const attemptId = Number(req.params.attemptId);
  const managerId = (req as AuthedRequest).employee?.employeeId;

  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return res.status(400).json({ message: "Invalid attempt ID" });
  }

  const result = await getAttemptDecisionDetails(attemptId, managerId);
  if (result.error) {
    return res.status(result.error.status).json({ message: result.error.message });
  }

  return res.status(200).json({ attempt: result.attempt });
});

// POST /decisions/:attemptId - Submit manager decision (APPROVED or REJECTED)
decisionsRouter.post("/:attemptId", async (req: Request, res: Response) => {
  const attemptId = Number(req.params.attemptId);
  const managerId = (req as AuthedRequest).employee?.employeeId;
  const { decision, decisionReason } = req.body;

  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return res.status(400).json({ message: "Invalid attempt ID" });
  }

  if (decision !== Decision.APPROVED && decision !== Decision.REJECTED) {
    return res.status(400).json({
      message: "Invalid decision. Must be either 'APPROVED' or 'REJECTED'",
    });
  }

  const result = await recordDecision(attemptId, managerId, decision, decisionReason);
  if (result.error) {
    return res.status(result.error.status).json({ message: result.error.message });
  }

  return res.status(200).json({
    message: `Attempt ${decision.toLowerCase()} successfully`,
    attempt: result.attempt,
  });
});