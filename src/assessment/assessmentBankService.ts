import { prisma } from "../lib/prisma.js";
import { Prisma, QuestionType, Visibility } from "../../generated/prisma/client.js";
import { generateAssessment, type GenerateAssessmentOptions } from "./assessmentGenerator.js";
import type {
  AssessmentGenerationResult,
  EmployeeQuestion,
  PrivateQuestionEvaluation,
  TestCaseItem,
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
  skill: { id: number; skillName: string; isNew: boolean };
  savedQuestions: BankQuestionSaveResult[];
  fullAssessment: AssessmentGenerationResult;
}

type BankRow = {
  questionType: QuestionType;
  questionContent: string;
  starterCode: string | null;
  mcqData?: Prisma.InputJsonValue;
  testCases?: { create: { input: string; expectedOutput: string; visibility: Visibility }[] };
};

function mismatch(n: number): never {
  throw new Error(`Question ${n}: employee and private question types do not match.`);
}

function toTests(cases: TestCaseItem[], visibility: Visibility) {
  return cases.map((tc) => ({
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    visibility,
  }));
}

function toBankRow(emp: EmployeeQuestion, priv: PrivateQuestionEvaluation): BankRow {
  switch (emp.questionType) {
    case "DEBUG": {
      if (priv.questionType !== "DEBUG") mismatch(emp.questionNumber);
      const content = [
        `### ${emp.title}`,
        emp.problemStatement,
        emp.employeeInstructions ? `**Instructions:** ${emp.employeeInstructions}` : "",
      ].filter(Boolean).join("\n\n");
      return {
        questionType: QuestionType.DEBUG,
        questionContent: content,
        starterCode: emp.buggyCode,
        testCases: {
          create: [
            ...toTests(emp.visibleTestCases, Visibility.VISIBLE),
            ...toTests(priv.hiddenTestCases, Visibility.HIDDEN_A),
          ],
        },
      };
    }

    case "SCRATCH": {
      if (priv.questionType !== "SCRATCH") mismatch(emp.questionNumber);
      const content = [
        `### ${emp.title}`,
        emp.problemStatement,
        emp.inputOutputRequirements ? `**Input / Output Requirements:**\n${emp.inputOutputRequirements}` : "",
        emp.constraints?.length ? `**Constraints:**\n${emp.constraints.map((c) => `- ${c}`).join("\n")}` : "",
        emp.edgeCases?.length ? `**Edge Cases:**\n${emp.edgeCases.map((e) => `- ${e}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      return {
        questionType: QuestionType.SCRATCH,
        questionContent: content,
        starterCode: emp.starterCode ?? null,
        testCases: {
          create: [
            ...toTests(emp.visibleTestCases, Visibility.VISIBLE),
            ...toTests(priv.hiddenTestCases, Visibility.HIDDEN_A),
          ],
        },
      };
    }

    case "MCQ": {
      if (priv.questionType !== "MCQ") mismatch(emp.questionNumber);
      const optionLines = emp.options.map((o) => `${o.id}. ${o.text}`).join("\n");
      const content = [
        `### ${emp.title}`,
        emp.problemStatement,
        emp.codeSnippet ? `\`\`\`\n${emp.codeSnippet}\n\`\`\`` : "",
        optionLines,
      ].filter(Boolean).join("\n\n");
      return {
        questionType: QuestionType.MCQ,
        questionContent: content,
        starterCode: null,
        mcqData: {
          options: emp.options,
          correctOptionId: priv.correctOptionId,
          explanation: priv.explanation,
          wrongOptionReasons: priv.wrongOptionReasons,
          gradingRubric: priv.gradingRubric,
          totalPoints: priv.totalPoints,
        } as unknown as Prisma.InputJsonValue,
        // No testCases: MCQ is graded by selection, not by execution.
      };
    }
  }
}

export async function saveAssessmentToQuestionBank(
  assessment: AssessmentGenerationResult,
  options: SaveToQuestionBankOptions = {},
): Promise<DirectPersistenceResult> {
  // 1. Resolve or create skill
  let resolved: { id: number; skillName: string } | null = null;
  let isNew = false;

  if (options.skillId) {
    resolved = await prisma.skill.findUnique({
      where: { id: options.skillId },
      select: { id: true, skillName: true },
    });
    if (!resolved) throw new Error(`Skill with ID ${options.skillId} not found in database.`);
  } else {
    const targetName = (options.skillName || assessment.metadata.language).trim();
    resolved = await prisma.skill.findFirst({
      where: { skillName: { equals: targetName, mode: "insensitive" } },
      select: { id: true, skillName: true },
    });
    if (!resolved) {
      resolved = await prisma.skill.create({
        data: { skillName: targetName },
        select: { id: true, skillName: true },
      });
      isNew = true;
    }
  }
  const skill = resolved;

  // 2. Pair each employee question with its private evaluation by questionNumber
  const rows = assessment.employeeFacing.questions.map((emp) => {
    const priv = assessment.privateEvaluation.questions.find(
      (p) => p.questionNumber === emp.questionNumber,
    );
    if (!priv) throw new Error(`No private evaluation for question ${emp.questionNumber}.`);
    return { emp, row: toBankRow(emp, priv) };
  });

  // 3. Save all questions in one transaction
  const savedQuestions = await prisma.$transaction(async (tx) => {
    const out: BankQuestionSaveResult[] = [];
    for (const { emp, row } of rows) {
      const record = await tx.question.create({
        data: {
          skillId: skill.id,
          proficiencyLevel: assessment.metadata.proficiencyLevel,
          ...row,
        },
        include: { testCases: true },
      });
      out.push({
        id: record.id,
        questionType: record.questionType,
        title: emp.title,
        totalTestCases: record.testCases.length,
        visibleTestCases: record.testCases.filter((t) => t.visibility === Visibility.VISIBLE).length,
        hiddenTestCases: record.testCases.filter((t) => t.visibility === Visibility.HIDDEN_A).length,
      });
    }
    return out;
  });

  return {
    skill: { id: skill.id, skillName: skill.skillName, isNew },
    savedQuestions,
    fullAssessment: assessment,
  };
}

export async function generateAndSaveAssessment(
  rawInput: unknown,
  options: GenerateAssessmentOptions & SaveToQuestionBankOptions = {},
): Promise<DirectPersistenceResult> {
  const assessment = await generateAssessment(rawInput, options);
  return saveAssessmentToQuestionBank(assessment, options);
}