import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AttemptStatus } from "../../generated/prisma/client.js";

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    attempt: {
      findMany: vi.fn(),
    },
    submission: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(mock),
    ),
  };
  return mock;
});

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("./attemptStateMachine.js", () => ({
  transitionAttempt: vi.fn().mockResolvedValue({}),
  transitionAttemptInTransaction: vi.fn().mockResolvedValue({}),
}));

const gradeAttemptMock = vi.fn().mockResolvedValue({});
vi.mock("../grading/gradingWorker.js", () => ({
  gradeAttempt: (...args: unknown[]) => gradeAttemptMock(...args),
}));

import { expireOverdueAttempts } from "./attempts.controller.js";
import { transitionAttemptInTransaction } from "./attemptStateMachine.js";

describe("expireOverdueAttempts", () => {
  let resStatus: number;
  let resBody: any;
  let mockRes: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    resStatus = 200;
    resBody = null;
    mockRes = {
      status: vi.fn((code: number) => {
        resStatus = code;
        return mockRes;
      }),
      json: vi.fn((data: any) => {
        resBody = data;
        return mockRes;
      }),
    } as unknown as Response;
  });

  it("handles when no attempts are overdue", async () => {
    prismaMock.attempt.findMany.mockResolvedValueOnce([]);

    await expireOverdueAttempts({} as Request, mockRes);

    expect(resStatus).toBe(200);
    expect(resBody).toEqual({ expiredCount: 0, expiredAttemptIds: [] });
    expect(transitionAttemptInTransaction).not.toHaveBeenCalled();
    expect(gradeAttemptMock).not.toHaveBeenCalled();
  });

  it("transitions overdue attempts, finalizes drafts, and triggers grading", async () => {
    prismaMock.attempt.findMany.mockResolvedValueOnce([
      {
        id: 42,
        status: AttemptStatus.IN_PROGRESS,
        questions: [{ questionId: 101 }],
      },
    ]);
    prismaMock.submission.findFirst.mockResolvedValueOnce({
      id: 501,
      isDraft: true,
    });

    await expireOverdueAttempts({} as Request, mockRes);

    expect(resStatus).toBe(200);
    expect(resBody).toEqual({ expiredCount: 1, expiredAttemptIds: [42] });
    expect(prismaMock.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 501 },
        data: expect.objectContaining({ isDraft: false }),
      }),
    );
    expect(transitionAttemptInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        attemptId: 42,
        toState: AttemptStatus.SUBMITTED,
        actor: { type: "SERVER" },
      }),
    );
    expect(gradeAttemptMock).toHaveBeenCalledWith(42);
  });
});

