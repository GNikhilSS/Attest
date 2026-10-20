
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AttemptStatus,
  GradingStatus,
} from "../../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  attemptFindUnique: vi.fn(),
  reportUpsert: vi.fn(),
  reportUpdate: vi.fn(),
  reportFindUnique: vi.fn(),
  submissionUpdate: vi.fn(),
  transactionReportUpdate: vi.fn(),
  transaction: vi.fn(),
  submitCode: vi.fn(),
  waitForSubmissionResult: vi.fn(),
  transitionAttempt: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    attempt: {
      findUnique: mocks.attemptFindUnique,
    },
    gradingReport: {
      upsert: mocks.reportUpsert,
      update: mocks.reportUpdate,
      findUnique: mocks.reportFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./judge0Client.js", () => ({
  submitCode: mocks.submitCode,
  waitForSubmissionResult: mocks.waitForSubmissionResult,
}));

vi.mock("../attempts/attemptStateMachine.js", () => ({
  transitionAttempt: mocks.transitionAttempt,
}));

import { gradeAttempt } from "./gradingWorker.js";

function makeTestCase(
  id: number,
  expectedOutput = "42",
  visibility: "VISIBLE" | "HIDDEN_A" | "HIDDEN_B" = "VISIBLE",
) {
  return {
    id,
    questionId: 10,
    input: `${id}`,
    expectedOutput,
    visibility,
  };
}

function makeSubmission(
  id: number,
  submittedAnswer: string,
  submittedAt: Date,
) {
  return {
    id,
    attemptId: 1,
    questionId: 10,
    submittedAnswer,
    submittedAt,
    isCorrect: null,
    gradingStatus: null,
    testResults: null,
  };
}

function makeQuestion(
  questionId: number,
  submissions: ReturnType<typeof makeSubmission>[] = [],
  testCases = [makeTestCase(1)],
) {
  return {
    attemptId: 1,
    questionId,
    position: questionId,
    question: {
      id: questionId,
      skillId: 1,
      proficiencyLevel: 1,
      questionType: "SCRATCH",
      questionContent: "Write a program",
      starterCode: null,
      testCases,
    },
    submissions,
  };
}

function makeAttempt(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 1,
    employeeId: 100,
    skillId: 1,
    proficiencyLevel: 1,
    status: AttemptStatus.SUBMITTED,
    startTime: new Date("2026-10-19T10:00:00Z"),
    deadline: new Date("2026-10-19T11:00:00Z"),
    decision: null,
    decisionReason: null,
    gradingReport: null,
    questions: [
      makeQuestion(
        10,
        [
          makeSubmission(
            1,
            "console.log(42)",
            new Date("2026-10-19T10:30:00Z"),
          ),
        ],
      ),
    ],
    ...overrides,
  };
}

function makeJudgeResult(
  stdout: string | null = "42",
  statusId = 3,
  description = "Accepted",
) {
  return {
    token: "judge-token",
    status: {
      id: statusId,
      description,
    },
    stdout,
    stderr: null,
    compile_output: null,
    time: "0.01",
    memory: 1024,
  };
}

describe("gradeAttempt", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.stubEnv("JUDGE0_LANGUAGE_ID", "109");

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt() as never,
    );

    mocks.reportUpsert.mockResolvedValue({ attemptId: 1 });

    mocks.reportUpdate.mockResolvedValue({
      attemptId: 1,
      status: GradingStatus.FAILED,
    });

    mocks.reportFindUnique.mockResolvedValue({
      attemptId: 1,
      status: GradingStatus.COMPLETED,
      totalTestCases: 1,
      passedTestCases: 1,
      score: 100,
    });

    mocks.submissionUpdate.mockResolvedValue({});
    mocks.transactionReportUpdate.mockResolvedValue({});

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          submission: {
            update: mocks.submissionUpdate,
          },
          gradingReport: {
            update: mocks.transactionReportUpdate,
          },
        }),
    );

    mocks.submitCode.mockResolvedValue({
      token: "judge-token",
    });

    mocks.waitForSubmissionResult.mockResolvedValue(
      makeJudgeResult(),
    );

    mocks.transitionAttempt.mockResolvedValue({
      attemptId: 1,
      fromState: AttemptStatus.SUBMITTED,
      toState: AttemptStatus.GRADED,
      transitionedAt: new Date(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an invalid Judge0 language ID", async () => {
    vi.stubEnv("JUDGE0_LANGUAGE_ID", "invalid");

    await expect(gradeAttempt(1)).rejects.toThrow(
      "JUDGE0_LANGUAGE_ID is not configured correctly",
    );

    expect(mocks.attemptFindUnique).not.toHaveBeenCalled();
    expect(mocks.submitCode).not.toHaveBeenCalled();
  });

  it("rejects a non-positive Judge0 language ID", async () => {
    vi.stubEnv("JUDGE0_LANGUAGE_ID", "0");

    await expect(gradeAttempt(1)).rejects.toThrow(
      "JUDGE0_LANGUAGE_ID is not configured correctly",
    );

    expect(mocks.attemptFindUnique).not.toHaveBeenCalled();
  });

  it("throws when the attempt does not exist", async () => {
    mocks.attemptFindUnique.mockResolvedValue(null);

    await expect(gradeAttempt(999)).rejects.toThrow(
      "ATTEMPT_NOT_FOUND",
    );

    expect(mocks.reportUpsert).not.toHaveBeenCalled();
    expect(mocks.submitCode).not.toHaveBeenCalled();
  });

  it("rejects an attempt that is not submitted", async () => {
    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.IN_PROGRESS,
      }) as never,
    );

    await expect(gradeAttempt(1)).rejects.toThrow(
      "ATTEMPT_NOT_SUBMITTED",
    );

    expect(mocks.reportUpsert).not.toHaveBeenCalled();
    expect(mocks.submitCode).not.toHaveBeenCalled();
  });

  it("returns the existing report for an already graded attempt", async () => {
    const existingReport = {
      attemptId: 1,
      status: GradingStatus.COMPLETED,
      score: 100,
    };

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.GRADED,
        gradingReport: existingReport,
      }) as never,
    );

    await expect(gradeAttempt(1)).resolves.toEqual(existingReport);

    expect(mocks.submitCode).not.toHaveBeenCalled();
    expect(mocks.reportUpsert).not.toHaveBeenCalled();
    expect(mocks.transitionAttempt).not.toHaveBeenCalled();
  });

  it("returns the existing report for an already decided attempt", async () => {
    const existingReport = {
      attemptId: 1,
      status: GradingStatus.COMPLETED,
      score: 100,
    };

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        status: AttemptStatus.DECIDED,
        gradingReport: existingReport,
      }) as never,
    );

    await expect(gradeAttempt(1)).resolves.toEqual(existingReport);

    expect(mocks.submitCode).not.toHaveBeenCalled();
    expect(mocks.transitionAttempt).not.toHaveBeenCalled();
  });

  it("retries the state transition when the report is already completed", async () => {
    const existingReport = {
      attemptId: 1,
      status: GradingStatus.COMPLETED,
      score: 100,
    };

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        gradingReport: existingReport,
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submitCode).not.toHaveBeenCalled();

    expect(mocks.transitionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 1,
        toState: AttemptStatus.GRADED,
        actor: { type: "SERVER" },
      }),
    );
  });

  it("grades only the latest submission for each question", async () => {
    const olderSubmission = makeSubmission(
      1,
      "old source code",
      new Date("2026-10-19T10:10:00Z"),
    );

    const latestSubmission = makeSubmission(
      2,
      "latest source code",
      new Date("2026-10-19T10:20:00Z"),
    );

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        questions: [
          makeQuestion(
            10,
            [latestSubmission, olderSubmission],
          ),
        ],
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submitCode).toHaveBeenCalledTimes(1);

    expect(mocks.submitCode).toHaveBeenCalledWith({
      source_code: "latest source code",
      language_id: 109,
      stdin: "1",
    });

    expect(mocks.submissionUpdate).toHaveBeenCalledTimes(1);

    expect(mocks.submissionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
      }),
    );

    expect(mocks.submissionUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
      }),
    );
  });

  it("marks a submission correct when every test case passes", async () => {
    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        questions: [
          makeQuestion(
            10,
            [
              makeSubmission(
                5,
                "console.log(42)",
                new Date(),
              ),
            ],
            [
              makeTestCase(1, "42"),
              makeTestCase(2, "42"),
            ],
          ),
        ],
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submitCode).toHaveBeenCalledTimes(2);

    expect(mocks.submissionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({
          isCorrect: true,
          gradingStatus: GradingStatus.COMPLETED,
        }),
      }),
    );

    expect(mocks.transactionReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attemptId: 1 },
        data: expect.objectContaining({
          status: GradingStatus.COMPLETED,
          totalTestCases: 2,
          passedTestCases: 2,
          score: 100,
        }),
      }),
    );
  });

  it("marks a submission incorrect when a test case fails", async () => {
    mocks.waitForSubmissionResult
      .mockResolvedValueOnce(makeJudgeResult("42"))
      .mockResolvedValueOnce(makeJudgeResult("wrong output"));

    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        questions: [
          makeQuestion(
            10,
            [
              makeSubmission(
                5,
                "console.log(42)",
                new Date(),
              ),
            ],
            [
              makeTestCase(1, "42"),
              makeTestCase(2, "42"),
            ],
          ),
        ],
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submissionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({
          isCorrect: false,
        }),
      }),
    );

    expect(mocks.transactionReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalTestCases: 2,
          passedTestCases: 1,
          score: 50,
        }),
      }),
    );
  });

  it("counts test cases as failed when a question has no submission", async () => {
    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        questions: [
          makeQuestion(10, [], [
            makeTestCase(1),
            makeTestCase(2),
          ]),
        ],
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submitCode).not.toHaveBeenCalled();

    expect(mocks.transactionReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalTestCases: 2,
          passedTestCases: 0,
          score: 0,
        }),
      }),
    );

    expect(mocks.submissionUpdate).not.toHaveBeenCalled();
  });

  it("stores actual output only for visible test cases", async () => {
    mocks.attemptFindUnique.mockResolvedValue(
      makeAttempt({
        questions: [
          makeQuestion(
            10,
            [
              makeSubmission(
                5,
                "console.log(42)",
                new Date(),
              ),
            ],
            [
              makeTestCase(1, "42", "VISIBLE"),
              makeTestCase(2, "42", "HIDDEN_A"),
              makeTestCase(3, "42", "HIDDEN_B"),
            ],
          ),
        ],
      }) as never,
    );

    await gradeAttempt(1);

    expect(mocks.submissionUpdate).toHaveBeenCalledTimes(1);

    const updateCall = mocks.submissionUpdate.mock.calls[0]!;

    const savedResults = updateCall[0].data.testResults;

    expect(savedResults).toHaveLength(3);

    expect(savedResults[0]).toEqual(
      expect.objectContaining({
        visibility: "VISIBLE",
        actualOutput: "42",
      }),
    );

    expect(savedResults[1]).toEqual(
      expect.objectContaining({
        visibility: "HIDDEN_A",
        actualOutput: null,
      }),
    );

    expect(savedResults[2]).toEqual(
      expect.objectContaining({
        visibility: "HIDDEN_B",
        actualOutput: null,
      }),
    );

    for (const result of savedResults) {
      expect(result).not.toHaveProperty("input");
      expect(result).not.toHaveProperty("expectedOutput");
    }
  });

  it("marks the report failed when Judge0 submission fails", async () => {
    mocks.submitCode.mockRejectedValue(
      new Error("Judge0 unavailable"),
    );

    await expect(gradeAttempt(1)).rejects.toThrow(
      "Judge0 unavailable",
    );

    expect(mocks.reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attemptId: 1 },
        data: { status: GradingStatus.FAILED },
      }),
    );

    expect(mocks.transitionAttempt).not.toHaveBeenCalled();
  });

  it("marks the report failed when Judge0 polling fails", async () => {
    mocks.waitForSubmissionResult.mockRejectedValue(
      new Error("Judge0 polling failed"),
    );

    await expect(gradeAttempt(1)).rejects.toThrow(
      "Judge0 polling failed",
    );

    expect(mocks.reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: GradingStatus.FAILED },
      }),
    );

    expect(mocks.transitionAttempt).not.toHaveBeenCalled();
  });

  it("marks the report failed when grading persistence fails", async () => {
    mocks.transaction.mockRejectedValue(
      new Error("Database write failed"),
    );

    await expect(gradeAttempt(1)).rejects.toThrow(
      "Database write failed",
    );

    expect(mocks.reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: GradingStatus.FAILED },
      }),
    );

    expect(mocks.transitionAttempt).not.toHaveBeenCalled();
  });

  it("preserves the completed report if the state transition fails", async () => {
    mocks.transitionAttempt.mockRejectedValue(
      new Error("CONCURRENT_TRANSITION"),
    );

    await expect(gradeAttempt(1)).rejects.toThrow(
      "CONCURRENT_TRANSITION",
    );

    // Grading succeeded and the report was completed.
    expect(mocks.transactionReportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GradingStatus.COMPLETED,
        }),
      }),
    );

    // A transition failure must not overwrite COMPLETED with FAILED.
    expect(mocks.reportUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: GradingStatus.FAILED },
      }),
    );
  });

  it("transitions to GRADED only after the transaction succeeds", async () => {
    const callOrder: string[] = [];

    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        callOrder.push("transaction-start");

        const result = await callback({
          submission: {
            update: mocks.submissionUpdate,
          },
          gradingReport: {
            update: mocks.transactionReportUpdate,
          },
        });

        callOrder.push("transaction-complete");
        return result;
      },
    );

    mocks.transitionAttempt.mockImplementation(async () => {
      callOrder.push("transition");
      return {};
    });

    await gradeAttempt(1);

    expect(callOrder.indexOf("transaction-complete")).toBeLessThan(
      callOrder.indexOf("transition"),
    );

    expect(mocks.transitionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 1,
        toState: AttemptStatus.GRADED,
        actor: { type: "SERVER" },
      }),
    );
  });
});
