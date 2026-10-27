import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptStatus, GradingStatus } from "../../generated/prisma/client.js";

const prismaMock = vi.hoisted(() => {
  const mock: any = {
    attempt: { findUnique: vi.fn() },
    gradingReport: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    submission: { update: vi.fn() },
    attemptEvent: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(mock),
    ),
  };
  return mock;
});

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

vi.mock("./judge0Client.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./judge0Client.js")>(),
  submitCode: vi.fn().mockResolvedValue({ token: "tok_123" }),
  waitForSubmissionResult: vi.fn().mockResolvedValue({
    token: "tok_123",
    status: { id: 3, description: "Accepted" },
    stdout: "42\n",
    stderr: null,
    compile_output: null,
    time: "0.01",
    memory: 1024,
  }),
}));

vi.mock("../attempts/attemptStateMachine.js", () => ({
  transitionAttempt: vi.fn().mockResolvedValue({}),
}));

import { gradeAttempt } from "./gradingWorker.js";

describe("gradeAttempt", () => {
  beforeEach(() => {
    vi.stubEnv("JUDGE0_LANGUAGE_ID", "71");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when attempt is not found", async () => {
    prismaMock.attempt.findUnique.mockResolvedValueOnce(null);
    await expect(gradeAttempt(999)).rejects.toThrow("ATTEMPT_NOT_FOUND");
  });

  it("throws when attempt is not in SUBMITTED status", async () => {
    prismaMock.attempt.findUnique.mockResolvedValueOnce({
      id: 1,
      status: AttemptStatus.IN_PROGRESS,
    });
    await expect(gradeAttempt(1)).rejects.toThrow("ATTEMPT_NOT_SUBMITTED");
  });

  it("successfully grades non-draft submissions and marks attempt GRADED", async () => {
    const mockAttempt = {
      id: 1,
      status: AttemptStatus.SUBMITTED,
      questions: [
        {
          question: {
            testCases: [
              {
                id: 101,
                input: "input",
                expectedOutput: "42",
                visibility: "VISIBLE",
              },
            ],
          },
          submissions: [
            {
              id: 201,
              submittedAnswer: "print(42)",
            },
          ],
        },
      ],
    };

    prismaMock.attempt.findUnique.mockResolvedValueOnce(mockAttempt);
    prismaMock.attemptEvent.findMany.mockResolvedValueOnce([
      { type: "TAB_SWITCH" },
      { type: "TAB_SWITCH" },
      { type: "COPY_PASTE" },
    ]);
    prismaMock.gradingReport.findUnique.mockResolvedValueOnce({
      attemptId: 1,
      status: GradingStatus.COMPLETED,
      score: 100,
    });

    const report = await gradeAttempt(1);
    expect(report?.status).toBe(GradingStatus.COMPLETED);
    expect(prismaMock.gradingReport.upsert).toHaveBeenCalled();
    expect(prismaMock.gradingReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attemptId: 1 },
        data: expect.objectContaining({
          status: GradingStatus.COMPLETED,
          score: 100,
          integritySummary: {
            totalEvents: 3,
            eventsByType: { TAB_SWITCH: 2, COPY_PASTE: 1 },
          },
        }),
      }),
    );
  });
});
