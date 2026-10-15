import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AttemptStatus as S } from "../../generated/prisma/client.js";

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  createEvent: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    $transaction: prismaMocks.transaction,
  },
}));

import { transitionAttempt } from "./attemptStateMachine.js";

const pastDeadline = new Date("2026-10-13T10:00:00.000Z");
const futureDeadline = new Date("2027-01-01T10:00:00.000Z");

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    employeeId: 2,
    approvedById: null,
    skillId: 1,
    proficiencyLevel: 2,
    status: S.CREATED,
    startTime: pastDeadline,
    deadline: futureDeadline,
    attemptBy: {
      id: 2,
      managedById: 1,
    },
    ...overrides,
  };
}

function setupAttempt(
  attempt: ReturnType<typeof makeAttempt> | null,
) {
  prismaMocks.findUnique.mockResolvedValue(attempt);
  prismaMocks.updateMany.mockResolvedValue({ count: 1 });
  prismaMocks.createEvent.mockResolvedValue({ id: 100 });

  prismaMocks.transaction.mockImplementation(
    async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        attempt: {
          findUnique: prismaMocks.findUnique,
          updateMany: prismaMocks.updateMany,
        },
        attemptEvent: {
          create: prismaMocks.createEvent,
        },
      }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transitionAttempt", () => {
  it("rejects when the attempt does not exist", async () => {
    setupAttempt(null);

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.IN_PROGRESS,
        actor: {
          type: "EMPLOYEE",
          employeeId: 2,
        },
      }),
    ).rejects.toThrow("ATTEMPT_NOT_FOUND");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition", async () => {
    setupAttempt(makeAttempt({ status: S.REQUESTED }));

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.CREATED,
        actor: { type: "SERVER" },
      }),
    ).rejects.toThrow("INVALID_TRANSITION");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects an employee who does not own the attempt", async () => {
    setupAttempt(makeAttempt());

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.IN_PROGRESS,
        actor: {
          type: "EMPLOYEE",
          employeeId: 99,
        },
      }),
    ).rejects.toThrow("FORBIDDEN");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects a manager who does not manage the employee", async () => {
    setupAttempt(makeAttempt({ status: S.REQUESTED }));

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.APPROVED,
        actor: {
          type: "MANAGER",
          employeeId: 99,
        },
      }),
    ).rejects.toThrow("FORBIDDEN");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects server submission before the deadline", async () => {
    setupAttempt(makeAttempt());

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.SUBMITTED,
        actor: { type: "SERVER" },
      }),
    ).rejects.toThrow("DEADLINE_NOT_PASSED");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects employee submission after the deadline", async () => {
    setupAttempt(
      makeAttempt({
        status: S.IN_PROGRESS,
        deadline: pastDeadline,
      }),
    );

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.SUBMITTED,
        actor: {
          type: "EMPLOYEE",
          employeeId: 2,
        },
      }),
    ).rejects.toThrow("DEADLINE_PASSED");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("opens an attempt and records its transition", async () => {
    setupAttempt(makeAttempt());

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.IN_PROGRESS,
      actor: {
        type: "EMPLOYEE",
        employeeId: 2,
      },
    });

    expect(result.attemptId).toBe(10);
    expect(result.fromState).toBe(S.CREATED);
    expect(result.toState).toBe(S.IN_PROGRESS);

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: S.CREATED,
      },
      data: {
        status: S.IN_PROGRESS,
        startTime: expect.any(Date),
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledOnce();
  });

  it("allows employee submission before the deadline", async () => {
    setupAttempt(
      makeAttempt({
        status: S.IN_PROGRESS,
        deadline: futureDeadline,
      }),
    );

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.SUBMITTED,
      actor: {
        type: "EMPLOYEE",
        employeeId: 2,
      },
    });

    expect(result.fromState).toBe(S.IN_PROGRESS);
    expect(result.toState).toBe(S.SUBMITTED);

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: S.IN_PROGRESS,
        deadline: { gt: expect.any(Date) },
      },
      data: {
        status: S.SUBMITTED,
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledOnce();
  });

  it("allows server submission of an expired unopened attempt", async () => {
    setupAttempt(
      makeAttempt({
        status: S.CREATED,
        deadline: pastDeadline,
      }),
    );

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.SUBMITTED,
      actor: { type: "SERVER" },
    });

    expect(result.fromState).toBe(S.CREATED);
    expect(result.toState).toBe(S.SUBMITTED);

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: S.CREATED,
        deadline: { lte: expect.any(Date) },
      },
      data: {
        status: S.SUBMITTED,
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 10,
        type: "NOT_STARTED",
      }),
    });
  });

  it("rejects a concurrent transition when the status changed", async () => {
    setupAttempt(makeAttempt());
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.IN_PROGRESS,
        actor: {
          type: "EMPLOYEE",
          employeeId: 2,
        },
      }),
    ).rejects.toThrow("CONCURRENT_TRANSITION");

    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("requires a reason when a manager rejects an attempt", async () => {
    setupAttempt(makeAttempt({ status: S.GRADED }));

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.DECIDED,
        actor: {
          type: "MANAGER",
          employeeId: 1,
        },
        metadata: {
          decision: "REJECTED",
          reason: "   ",
        },
      }),
    ).rejects.toThrow("REJECTION_REASON_REQUIRED");

    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.createEvent).not.toHaveBeenCalled();
  });

  it("records the correct states and actor in the transition event", async () => {
    setupAttempt(makeAttempt());

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.IN_PROGRESS,
      actor: {
        type: "EMPLOYEE",
        employeeId: 2,
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 10,
        type: "STATE_TRANSITION",
        serverTime: result.transitionedAt,
        payload: {
          from: S.CREATED,
          to: S.IN_PROGRESS,
          actorType: "EMPLOYEE",
          actorId: 2,
          metadata: {},
        },
      }),
    });
  });

  it("does not report success when event creation fails", async () => {
    setupAttempt(makeAttempt());

    prismaMocks.createEvent.mockRejectedValue(
      new Error("EVENT_WRITE_FAILED"),
    );

    await expect(
      transitionAttempt({
        attemptId: 10,
        toState: S.IN_PROGRESS,
        actor: {
          type: "EMPLOYEE",
          employeeId: 2,
        },
      }),
    ).rejects.toThrow("EVENT_WRITE_FAILED");

    expect(prismaMocks.updateMany).toHaveBeenCalledOnce();
    expect(prismaMocks.createEvent).toHaveBeenCalledOnce();
  });

  it("allows a manager to approve a request and records the approver", async () => {
    setupAttempt(
      makeAttempt({
        status: S.REQUESTED,
      }),
    );

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.APPROVED,
      actor: {
        type: "MANAGER",
        employeeId: 1,
      },
    });

    expect(result.fromState).toBe(S.REQUESTED);
    expect(result.toState).toBe(S.APPROVED);

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: S.REQUESTED,
      },
      data: {
        status: S.APPROVED,
        approvedById: 1,
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 10,
        type: "STATE_TRANSITION",
        payload: {
          from: S.REQUESTED,
          to: S.APPROVED,
          actorType: "MANAGER",
          actorId: 1,
          metadata: {},
        },
      }),
    });
  });

  it("allows a manager to reject a graded attempt and records the reason", async () => {
    setupAttempt(
      makeAttempt({
        status: S.GRADED,
      }),
    );

    const result = await transitionAttempt({
      attemptId: 10,
      toState: S.DECIDED,
      actor: {
        type: "MANAGER",
        employeeId: 1,
      },
      metadata: {
        decision: "REJECTED",
        reason: "The evidence does not meet the required standard.",
      },
    });

    expect(result.fromState).toBe(S.GRADED);
    expect(result.toState).toBe(S.DECIDED);

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        status: S.GRADED,
      },
      data: {
        status: S.DECIDED,
      },
    });

    expect(prismaMocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 10,
        type: "STATE_TRANSITION",
        payload: {
          from: S.GRADED,
          to: S.DECIDED,
          actorType: "MANAGER",
          actorId: 1,
          metadata: {
            decision: "REJECTED",
            reason: "The evidence does not meet the required standard.",
          },
        },
      }),
    });
  });
});
