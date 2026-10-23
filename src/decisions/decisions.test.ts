import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptStatus, Decision } from "../../generated/prisma/client.js";

const prismaMock = vi.hoisted(() => ({
  attempt: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("../attempts/attemptStateMachine.js", () => ({
  transitionAttempt: vi.fn().mockResolvedValue({}),
}));

import {
  getManagerDecisionQueue,
  getAttemptDecisionDetails,
  recordDecision,
} from "./decisions.service.js";

describe("decisions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the decision queue for a manager", async () => {
    prismaMock.attempt.findMany.mockResolvedValueOnce([
      { id: 1, status: AttemptStatus.GRADED },
    ]);

    const queue = await getManagerDecisionQueue(10);
    expect(queue).toHaveLength(1);
    expect(prismaMock.attempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: AttemptStatus.GRADED,
          attemptBy: { managedById: 10 },
        },
      }),
    );
  });

  it("returns error if caller is not the employee's manager", async () => {
    prismaMock.attempt.findUnique.mockResolvedValueOnce({
      id: 1,
      attemptBy: { managedById: 999 }, // not 10
    });

    const result = await getAttemptDecisionDetails(1, 10);
    expect(result.error?.status).toBe(403);
    expect(result.error?.message).toContain("not the manager");
  });

  it("requires a reason when decision is REJECTED", async () => {
    prismaMock.attempt.findUnique.mockResolvedValueOnce({
      id: 1,
      status: AttemptStatus.GRADED,
      attemptBy: { managedById: 10 },
    });

    const result = await recordDecision(1, 10, Decision.REJECTED, "");
    expect(result.error?.status).toBe(400);
    expect(result.error?.message).toContain("decisionReason is required");
  });

  it("successfully records an APPROVED decision", async () => {
    prismaMock.attempt.findUnique
      .mockResolvedValueOnce({
        id: 1,
        status: AttemptStatus.GRADED,
        attemptBy: { managedById: 10 },
      })
      .mockResolvedValueOnce({
        id: 1,
        status: AttemptStatus.DECIDED,
        decision: Decision.APPROVED,
      });

    const result = await recordDecision(1, 10, Decision.APPROVED);
    expect(result.attempt?.decision).toBe(Decision.APPROVED);
  });
});