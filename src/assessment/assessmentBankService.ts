import { prisma } from "../lib/prisma.js";
import { QuestionType, Visibility } from "../../generated/prisma/enums.js";
import {
  generateAssessment,
  type GenerateAssessmentOptions,
} from "./assessmentGenerator.js";
import type {
  AssessmentGenerationResult,
  EmployeeDebugQuestion,
  EmployeeScratchQuestion,
  PrivateDebugEvaluation,
  PrivateScratchEvaluation,
} from "./assessment.types.js";

export interface SaveToQuestionBankOptions {
  skillId?: number | undefined;
  skillName?: string | undefined;
}

export interface BankQuestionSaveResult {
  id: number;
  questionType: QuestionType;
  title: string;
  totalTestCases: number;
  visibleTestCases: number;
  hiddenTestCases: number;
}

export interface DirectPersistenceResult {
  skill: {
    id: number;
    skillName: string;
    isNew: boolean;
  };
  savedQuestions: BankQuestionSaveResult[];
  fullAssessment: AssessmentGenerationResult;
}

function stringifySafe(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === undefined || val === null) return "";
  return JSON.stringify(val);
}

/**
 * Persists generated coding & debugging assessment questions into the Attest database.
 * Directly populates the Question and TestCase tables for the resolved Skill.
 * Enforces exactly 2 visible test cases (VISIBLE) and 1 hidden test case (HIDDEN_A) per question.
 */
export async function saveAssessmentToQuestionBank(
  assessment: AssessmentGenerationResult,
  options: SaveToQuestionBankOptions = {}
): Promise<DirectPersistenceResult> {
  // 1. Resolve or create Skill
  let skill: { id: number; skillName: string } | null = null;
  let isNew = false;

  if (options.skillId) {
    skill = await prisma.skill.findUnique({
      where: { id: options.skillId },
      select: { id: true, skillName: true },
    });
    if (!skill) {
      throw new Error(`Skill with ID ${options.skillId} not found in database.`);
    }
  } else {
    const targetName = (options.skillName || assessment.metadata.language).trim();
    skill = await prisma.skill.findFirst({
      where: {
        skillName: {
          equals: targetName,
          mode: "insensitive",
        },
      },
      select: { id: true, skillName: true },
    });

    if (!skill) {
      skill = await prisma.skill.create({
        data: {
          skillName: targetName,
        },
        select: { id: true, skillName: true },
      });
      isNew = true;
    }
  }

  // 2. Extract DEBUG (index 0) and SCRATCH (index 1) questions
  const employeeQ1 = assessment.employeeFacing.questions[0] as EmployeeDebugQuestion;
  const privateQ1 = assessment.privateEvaluation.questions[0] as PrivateDebugEvaluation;

  const employeeQ2 = assessment.employeeFacing.questions[1] as EmployeeScratchQuestion;
  const privateQ2 = assessment.privateEvaluation.questions[1] as PrivateScratchEvaluation;

  // 3. Format questionContent
  const debugContent = [
    `### ${employeeQ1.title}`,
    employeeQ1.problemStatement,
    employeeQ1.employeeInstructions ? `\n**Instructions:** ${employeeQ1.employeeInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const scratchContent = [
    `### ${employeeQ2.title}`,
    employeeQ2.problemStatement,
    employeeQ2.inputOutputRequirements ? `\n**Input / Output Requirements:**\n${employeeQ2.inputOutputRequirements}` : "",
    employeeQ2.constraints?.length
      ? `\n**Constraints:**\n${employeeQ2.constraints.map((c) => `- ${c}`).join("\n")}`
      : "",
    employeeQ2.edgeCases?.length
      ? `\n**Edge Cases:**\n${employeeQ2.edgeCases.map((e) => `- ${e}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // 4. Save atomically in a database transaction (2 visible + 1 hidden A per question)
  const [savedDebug, savedScratch] = await prisma.$transaction(async (tx) => {
    const debugRecord = await tx.question.create({
      data: {
        skillId: skill.id,
        proficiencyLevel: assessment.metadata.proficiencyLevel,
        questionType: QuestionType.DEBUG,
        questionContent: debugContent,
        starterCode: employeeQ1.buggyCode,
        testCases: {
          create: [
            ...(employeeQ1.visibleTestCases || []).slice(0, 2).map((tc) => ({
              input: stringifySafe(tc.input),
              expectedOutput: stringifySafe(tc.expectedOutput),
              visibility: Visibility.VISIBLE,
            })),
            ...(privateQ1.hiddenTestCases || []).slice(0, 1).map((tc) => ({
              input: stringifySafe(tc.input),
              expectedOutput: stringifySafe(tc.expectedOutput),
              visibility: Visibility.HIDDEN_A,
            })),
          ],
        },
      },
      include: {
        testCases: true,
      },
    });

    const scratchRecord = await tx.question.create({
      data: {
        skillId: skill.id,
        proficiencyLevel: assessment.metadata.proficiencyLevel,
        questionType: QuestionType.SCRATCH,
        questionContent: scratchContent,
        starterCode: employeeQ2.starterCode || null,
        testCases: {
          create: [
            ...(employeeQ2.visibleTestCases || []).slice(0, 2).map((tc) => ({
              input: stringifySafe(tc.input),
              expectedOutput: stringifySafe(tc.expectedOutput),
              visibility: Visibility.VISIBLE,
            })),
            ...(privateQ2.hiddenTestCases || []).slice(0, 1).map((tc) => ({
              input: stringifySafe(tc.input),
              expectedOutput: stringifySafe(tc.expectedOutput),
              visibility: Visibility.HIDDEN_A,
            })),
          ],
        },
      },
      include: {
        testCases: true,
      },
    });

    return [debugRecord, scratchRecord];
  });

  const savedQuestionsSummary: BankQuestionSaveResult[] = [
    {
      id: savedDebug.id,
      questionType: QuestionType.DEBUG,
      title: employeeQ1.title,
      totalTestCases: savedDebug.testCases.length,
      visibleTestCases: savedDebug.testCases.filter((t) => t.visibility === Visibility.VISIBLE).length,
      hiddenTestCases: savedDebug.testCases.filter((t) => t.visibility === Visibility.HIDDEN_A).length,
    },
    {
      id: savedScratch.id,
      questionType: QuestionType.SCRATCH,
      title: employeeQ2.title,
      totalTestCases: savedScratch.testCases.length,
      visibleTestCases: savedScratch.testCases.filter((t) => t.visibility === Visibility.VISIBLE).length,
      hiddenTestCases: savedScratch.testCases.filter((t) => t.visibility === Visibility.HIDDEN_A).length,
    },
  ];

  return {
    skill: {
      id: skill.id,
      skillName: skill.skillName,
      isNew,
    },
    savedQuestions: savedQuestionsSummary,
    fullAssessment: assessment,
  };
}

/**
 * Generates an assessment using Gemini and immediately persists it into the question bank.
 */
export async function generateAndSaveAssessment(
  rawInput: unknown,
  options: GenerateAssessmentOptions & SaveToQuestionBankOptions = {}
): Promise<DirectPersistenceResult> {
  const assessment = await generateAssessment(rawInput, options);
  return await saveAssessmentToQuestionBank(assessment, options);
}
