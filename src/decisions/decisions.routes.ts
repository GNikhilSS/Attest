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
  try {
    const managerId = (req as AuthedRequest).employee?.employeeId;
    const queue = await getManagerDecisionQueue(managerId);
    return res.status(200).json({ queue });
  } catch (error) {
    console.error("Failed to fetch decision queue:", error);
    return res.status(500).json({ message: "Failed to fetch decision queue" });
  }
});

// GET /decisions/:attemptId - View complete attempt details, grading report, and events
decisionsRouter.get("/:attemptId", async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error("Failed to fetch decision details:", error);
    return res.status(500).json({ message: "Failed to fetch decision details" });
  }
});

// POST /decisions/:attemptId - Submit manager decision (APPROVED or REJECTED)
decisionsRouter.post("/:attemptId", async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error("Failed to record decision:", error);
    return res.status(500).json({ message: "Failed to record decision" });
  }
});