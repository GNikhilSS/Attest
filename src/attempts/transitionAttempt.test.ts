import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptStatus as S } from "../../generated/prisma/client.js";

const prismaMocks = {
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  createEvent: vi.fn(),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (cb) =>
      cb({
        attempt: {
          findUnique: prismaMocks.findUnique,
          updateMany: prismaMocks.updateMany,
        },
        attemptEvent: {
          create: prismaMocks.createEvent,
        },
        $executeRaw: prismaMocks.executeRaw,
        $queryRaw: prismaMocks.queryRaw,
      }),
    ),
  },
}));

import { transitionAttempt } from "./attemptStateMachine.js";

describe("transitionAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when attempt does not exist", async () => {
    prismaMocks.findUnique.mockResolvedValueOnce(null);

    await expect(
      transitionAttempt({
        attemptId: 99,
        toState: S.APPROVED,
        actor: { type: "MANAGER", employeeId: 1 },
      }),
    ).rejects.toThrow("ATTEMPT_NOT_FOUND");
  });

  it("successfully transitions state and writes audit event", async () => {
    prismaMocks.findUnique.mockResolvedValueOnce({
      id: 1,
      status: S.REQUESTED,
      deadline: null,
      attemptBy: { id: 2, managedById: 1 },
    });
    prismaMocks.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMocks.createEvent.mockResolvedValueOnce({ id: 10 });

    const result = await transitionAttempt({
      attemptId: 1,
      toState: S.APPROVED,
      actor: { type: "MANAGER", employeeId: 1 },
    });

    expect(result.fromState).toBe(S.REQUESTED);
    expect(result.toState).toBe(S.APPROVED);
    expect(prismaMocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptId: 1,
          type: "STATE_TRANSITION",
        }),
      }),
    );
  });

  it("rejects transition if actor is not authorized", async () => {
    prismaMocks.findUnique.mockResolvedValueOnce({
      id: 1,
      status: S.REQUESTED,
      deadline: null,
      attemptBy: { id: 2, managedById: 1 },
    });

    // Employee 99 is not the manager (manager is 1)
    await expect(
      transitionAttempt({
        attemptId: 1,
        toState: S.APPROVED,
        actor: { type: "MANAGER", employeeId: 99 },
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
