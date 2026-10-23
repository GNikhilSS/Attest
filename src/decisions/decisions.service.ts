import { AttemptStatus, Decision } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { transitionAttempt } from "../attempts/attemptStateMachine.js";

export async function getManagerDecisionQueue(managerId: number) {
  return prisma.attempt.findMany({
    where: {
      status: AttemptStatus.GRADED,
      attemptBy: { managedById: managerId },
    },
    include: {
      attemptBy: { select: { id: true, name: true } },
      skill: { select: { id: true, skillName: true } },
      gradingReport: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAttemptDecisionDetails(attemptId: number, managerId: number) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      attemptBy: { select: { id: true, name: true, managedById: true } },
      skill: { select: { id: true, skillName: true } },
      gradingReport: true,
      events: { orderBy: { serverTime: "asc" } },
      questions: {
        include: {
          question: {
            select: {
              id: true,
              questionContent: true,
              questionType: true,
            },
          },
          submissions: {
            where: { isDraft: false },
            orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!attempt) {
    return { error: { status: 404, message: "Attempt not found" } };
  }

  if (attempt.attemptBy.managedById !== managerId) {
    return { error: { status: 403, message: "You are not the manager for this employee" } };
  }

  return { attempt };
}

export async function recordDecision(
  attemptId: number,
  managerId: number,
  decision: Decision,
  decisionReason?: string,
) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      attemptBy: { select: { id: true, managedById: true } },
    },
  });

  if (!attempt) {
    return { error: { status: 404, message: "Attempt not found" } };
  }

  if (attempt.attemptBy.managedById !== managerId) {
    return { error: { status: 403, message: "You are not the manager for this employee" } };
  }

  if (attempt.status !== AttemptStatus.GRADED) {
    return {
      error: {
        status: 409,
        message: `Attempt cannot be decided in status ${attempt.status}. It must be GRADED.`,
      },
    };
  }

  if (decision === Decision.REJECTED && !decisionReason?.trim()) {
    return {
      error: {
        status: 400,
        message: "A decisionReason is required when rejecting an attempt",
      },
    };
  }

  await transitionAttempt({
    attemptId,
    toState: AttemptStatus.DECIDED,
    actor: { type: "MANAGER", employeeId: managerId },
    decision,
    ...(decisionReason?.trim() ? { decisionReason: decisionReason.trim() } : {}),
  });

  const updated = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { gradingReport: true },
  });

  return { attempt: updated };
}