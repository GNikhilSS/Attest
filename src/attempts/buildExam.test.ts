import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildExam } from "./attempts.helper.js";
import { prisma } from "../lib/prisma.js";
import { AttemptStatus } from "../../generated/prisma/enums.js";
import * as bankService from "../assessment/assessmentBankService.js";
import * as stateMachine from "./attemptStateMachine.js";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      attempt: {
        findUnique: vi.fn(),
      },
      question: {
        findMany: vi.fn(),
      },
      attemptQuestion: {
        create: vi.fn(),
      },
    },
  };
});

vi.mock("./attemptStateMachine.js", () => {
  return {
    transitionAttempt: vi.fn(),
  };
});

vi.mock("../assessment/assessmentBankService.js", () => {
  return {
    generateAndSaveAssessment: vi.fn(),
  };
});

describe("buildExam with Automatic Question Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retrieves existing questions from DB without invoking LLM if questions exist", async () => {
    vi.mocked(prisma.attempt.findUnique).mockResolvedValueOnce({
      id: 1,
      skillId: 10,
      proficiencyLevel: 2,
      skill: { id: 10, skillName: "Python" },
    } as any);

    vi.mocked(prisma.question.findMany).mockResolvedValueOnce([
      { id: 101, skillId: 10, proficiencyLevel: 2 },
      { id: 102, skillId: 10, proficiencyLevel: 2 },
    ] as any);

    vi.mocked(prisma.attemptQuestion.create).mockResolvedValue({} as any);
    vi.mocked(stateMachine.transitionAttempt).mockResolvedValueOnce({
      id: 1,
      status: AttemptStatus.CREATED,
    } as any);

    const result = await buildExam(1);

    expect(prisma.question.findMany).toHaveBeenCalledTimes(1);
    expect(bankService.generateAndSaveAssessment).not.toHaveBeenCalled();
    expect(prisma.attemptQuestion.create).toHaveBeenCalledTimes(2);
    expect((result as any).status).toBe(AttemptStatus.CREATED);
  });

  it("automatically generates and saves questions when bank has fewer than 2 questions", async () => {
    vi.mocked(prisma.attempt.findUnique).mockResolvedValueOnce({
      id: 2,
      skillId: 20,
      proficiencyLevel: 3,
      skill: { id: 20, skillName: "JavaScript" },
    } as any);

    // First lookup returns empty bank
    vi.mocked(prisma.question.findMany).mockResolvedValueOnce([]);

    // Generator populates the bank
    vi.mocked(bankService.generateAndSaveAssessment).mockResolvedValueOnce({} as any);

    // Second lookup returns the newly generated questions
    vi.mocked(prisma.question.findMany).mockResolvedValueOnce([
      { id: 201, skillId: 20, proficiencyLevel: 3 },
      { id: 202, skillId: 20, proficiencyLevel: 3 },
    ] as any);

    vi.mocked(prisma.attemptQuestion.create).mockResolvedValue({} as any);
    vi.mocked(stateMachine.transitionAttempt).mockResolvedValueOnce({
      id: 2,
      status: AttemptStatus.CREATED,
    } as any);

    const result = await buildExam(2);

    expect(bankService.generateAndSaveAssessment).toHaveBeenCalledWith(
      {
        language: "JavaScript",
        proficiencyLevel: 3,
      },
      {
        skillId: 20,
      }
    );

    expect(prisma.question.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.attemptQuestion.create).toHaveBeenCalledTimes(2);
    expect((result as any).status).toBe(AttemptStatus.CREATED);
  });

  it("throws ATTEMPT_NOT_FOUND if attempt does not exist", async () => {
    vi.mocked(prisma.attempt.findUnique).mockResolvedValueOnce(null);

    await expect(buildExam(999)).rejects.toThrow("ATTEMPT_NOT_FOUND");
  });
});

