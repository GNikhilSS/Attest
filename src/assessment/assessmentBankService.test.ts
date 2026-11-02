import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveAssessmentToQuestionBank } from "./assessmentBankService.js";
import { prisma } from "../lib/prisma.js";
import { QuestionType, Visibility } from "../../generated/prisma/enums.js";
import type { AssessmentGenerationResult } from "./assessment.types.js";

vi.mock("../lib/prisma.js", () => {
  return {
    prisma: {
      skill: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      question: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe("Direct Question Bank Persistence Service", () => {
  const mockAssessment: AssessmentGenerationResult = {
    success: true,
    metadata: {
      language: "Python",
      proficiencyLevel: 2,
      proficiencyLevelName: "Learning",
      model: "gemini-3.5-flash",
      generatedAt: "2026-11-01T10:00:00Z",
    },
    employeeFacing: {
      metadata: {
        language: "Python",
        proficiencyLevel: 2,
        proficiencyLevelName: "Learning",
        proficiencyDescription: "Common language features and straightforward debugging.",
        summary: "Assessment for Python",
        totalQuestions: 2,
      },
      questions: [
        {
          questionNumber: 1,
          questionType: "DEBUG",
          title: "Fix Off-by-one Error",
          problemStatement: "The function sum_elements has an off-by-one bug.",
          buggyCode: "def sum_elements(arr):\n    return sum(arr[0:len(arr)+1])",
          language: "Python",
          employeeInstructions: "Correct the indexing bug.",
          visibleTestCases: [
            { input: "[1, 2, 3]", expectedOutput: "6", description: "Basic sum" },
            { input: "[]", expectedOutput: "0", description: "Empty list" },
          ],
        },
        {
          questionNumber: 2,
          questionType: "SCRATCH",
          title: "Filter Evens",
          problemStatement: "Write a function filter_evens that takes a list and returns even numbers.",
          inputOutputRequirements: "Input: List of integers. Output: List of even integers.",
          starterCode: "def filter_evens(nums):\n    pass",
          language: "Python",
          constraints: ["Keep original order"],
          visibleTestCases: [
            { input: "[1, 2, 3, 4]", expectedOutput: "[2, 4]", description: "Mixed numbers" },
            { input: "[]", expectedOutput: "[]", description: "Empty list" },
          ],
        },
      ],
    },
    privateEvaluation: {
      metadata: {
        language: "Python",
        proficiencyLevel: 2,
        proficiencyLevelName: "Learning",
        evaluatedModel: "gemini-3.5-flash",
        generatedAt: "2026-11-01T10:00:00Z",
      },
      questions: [
        {
          questionNumber: 1,
          questionType: "DEBUG",
          title: "Fix Off-by-one Error",
          rootCause: "Slice bounds exceed array length.",
          correctedCode: "def sum_elements(arr):\n    return sum(arr)",
          hiddenTestCases: [
            { input: "[5, 5]", expectedOutput: "10", purpose: "Hidden Set A regression test" },
          ],
          gradingRubric: [{ criteria: "Fix", points: 10, description: "Correct fix" }],
          totalPoints: 10,
        },
        {
          questionNumber: 2,
          questionType: "SCRATCH",
          title: "Filter Evens",
          referenceSolution: "def filter_evens(nums):\n    return [n for n in nums if n % 2 == 0]",
          hiddenTestCases: [
            { input: "[-2, -3]", expectedOutput: "[-2]", purpose: "Hidden Set A negative numbers" },
          ],
          gradingRubric: [{ criteria: "Logic", points: 10, description: "Working filter" }],
          totalPoints: 10,
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists exactly 2 visible test cases and 1 hidden A test case per question atomically", async () => {
    vi.mocked(prisma.skill.findFirst).mockResolvedValueOnce({
      id: 10,
      skillName: "Python",
    } as any);

    const mockSavedDebug = {
      id: 101,
      skillId: 10,
      proficiencyLevel: 2,
      questionType: QuestionType.DEBUG,
      questionContent: "### Fix Off-by-one Error\n\nThe function sum_elements has an off-by-one bug.",
      starterCode: "def sum_elements(arr):\n    return sum(arr[0:len(arr)+1])",
      testCases: [
        { id: 1, input: "[1, 2, 3]", expectedOutput: "6", visibility: Visibility.VISIBLE },
        { id: 2, input: "[]", expectedOutput: "0", visibility: Visibility.VISIBLE },
        { id: 3, input: "[5, 5]", expectedOutput: "10", visibility: Visibility.HIDDEN_A },
      ],
    };

    const mockSavedScratch = {
      id: 102,
      skillId: 10,
      proficiencyLevel: 2,
      questionType: QuestionType.SCRATCH,
      questionContent: "### Filter Evens\n\nWrite a function filter_evens that takes a list and returns even numbers.",
      starterCode: "def filter_evens(nums):\n    pass",
      testCases: [
        { id: 4, input: "[1, 2, 3, 4]", expectedOutput: "[2, 4]", visibility: Visibility.VISIBLE },
        { id: 5, input: "[]", expectedOutput: "[]", visibility: Visibility.VISIBLE },
        { id: 6, input: "[-2, -3]", expectedOutput: "[-2]", visibility: Visibility.HIDDEN_A },
      ],
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        question: {
          create: vi.fn()
            .mockResolvedValueOnce(mockSavedDebug)
            .mockResolvedValueOnce(mockSavedScratch),
        },
      };
      return await callback(tx);
    });

    const result = await saveAssessmentToQuestionBank(mockAssessment);

    expect(result.skill).toEqual({
      id: 10,
      skillName: "Python",
      isNew: false,
    });
    expect(result.savedQuestions).toHaveLength(2);
    expect(result.savedQuestions[0]).toEqual({
      id: 101,
      questionType: QuestionType.DEBUG,
      title: "Fix Off-by-one Error",
      totalTestCases: 3,
      visibleTestCases: 2,
      hiddenTestCases: 1,
    });
    expect(result.savedQuestions[1]).toEqual({
      id: 102,
      questionType: QuestionType.SCRATCH,
      title: "Filter Evens",
      totalTestCases: 3,
      visibleTestCases: 2,
      hiddenTestCases: 1,
    });
  });

  it("creates a new skill if not found in database", async () => {
    vi.mocked(prisma.skill.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.skill.create).mockResolvedValueOnce({
      id: 99,
      skillName: "Python",
    } as any);

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        question: {
          create: vi.fn().mockResolvedValue({
            id: 201,
            testCases: [],
          }),
        },
      };
      return await callback(tx);
    });

    const result = await saveAssessmentToQuestionBank(mockAssessment);

    expect(prisma.skill.create).toHaveBeenCalledWith({
      data: { skillName: "Python" },
      select: { id: true, skillName: true },
    });
    expect(result.skill.isNew).toBe(true);
    expect(result.skill.id).toBe(99);
  });
});
