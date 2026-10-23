import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const domainErrorMap: Record<string, { status: number; message: string }> = {
  ATTEMPT_NOT_FOUND: { status: 404, message: "Attempt not found" },
  SKILL_NOT_FOUND: { status: 404, message: "Skill not found" },
  UNAUTHORIZED_MANAGER: { status: 403, message: "You are not the manager for this employee" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  DEADLINE_PASSED: { status: 409, message: "Exam deadline has passed" },
  DEADLINE_NOT_PASSED: { status: 409, message: "Exam deadline has not passed" },
  CONCURRENT_TRANSITION: { status: 409, message: "Concurrent transition detected" },
  INVALID_MANAGER_DECISION: { status: 400, message: "Invalid manager decision" },
  REJECTION_REASON_REQUIRED: { status: 400, message: "Rejection reason is required" },
  NOT_ENOUGH_QUESTIONS: { status: 400, message: "Not enough questions in bank" },
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  if (err instanceof Error) {
    const mapped = domainErrorMap[err.message];
    if (mapped) {
      return res.status(mapped.status).json({ message: mapped.message });
    }

    if (err.message.startsWith("INVALID_TRANSITION")) {
      return res.status(409).json({ message: "Attempt cannot transition in its current state" });
    }
  }

  console.error("Internal server error:", err);
  return res.status(500).json({ message: "Server error" });
}