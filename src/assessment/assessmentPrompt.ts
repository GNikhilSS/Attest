import type { QuestionType } from "../../generated/prisma/enums.js";
import {
  DEFAULT_QUESTIONS_FORMAT,
  PROFICIENCY_LEVELS,
  type AssessmentInput,
  type ProficiencyLevelNumber,
  type QuestionSpecItem,
} from "./assessment.types.js";

export class AssessmentInputError extends Error {
  constructor(message: string, public readonly clarificationNeeded: string) {
    super(message);
    this.name = "AssessmentInputError";
  }
}

const VALID_TYPES: readonly QuestionType[] = ["DEBUG", "SCRATCH", "MCQ"]

function normalizeSpec(raw: unknown): QuestionSpecItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AssessmentInputError(
      "Invalid questions format.",
      "Specify at least one question type with a count."
    );
  }

  return raw.map(item => {
    const type = (item as any)?.type;
    const count = Number((item as any)?.count);
    if (!VALID_TYPES.includes(type)) {
      throw new AssessmentInputError(
        `Unknown question type: ${type}.`,
        "Use DEBUG, SCRATCH, or MCQ."
      );
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new AssessmentInputError(
        `Invalid count for ${type}: ${count}.`,
        "Counts must be positive integers."
      );
    }

    return { type, count }
  })
}

export function validateAssessmentInput(input: unknown): AssessmentInput {
  if (!input || typeof input !== "object") {
    throw new AssessmentInputError(
      "Missing request payload.",
      "Please provide the programming language or technology and the proficiency level (1 to 5)."
    );
  }

  const { language, proficiencyLevel, topic, questionsFormat } = input as Record<string, unknown>;

  if (!language || typeof language !== "string" || language.trim().length === 0) {
    throw new AssessmentInputError(
      "Missing or invalid programming language/technology.",
      "Please specify the programming language or technology (e.g. JavaScript, Python, TypeScript, SQL, React)."
    );
  }

  const numericLevel = Number(proficiencyLevel);
  if (!Number.isInteger(numericLevel) || numericLevel < 1 || numericLevel > 5) {
    throw new AssessmentInputError(
      `Invalid proficiency level: ${proficiencyLevel}. Must be an integer between 1 and 5.`,
      "Please provide a valid proficiency level from 1 to 5 (1: Novice, 2: Learning, 3: Skilled, 4: Highly Skilled, 5: Mastery)."
    );
  }

  return {
    language: language.trim(),
    proficiencyLevel: numericLevel as ProficiencyLevelNumber,
    questionsFormat: normalizeSpec(questionsFormat ?? DEFAULT_QUESTIONS_FORMAT),
    ...(typeof topic === "string" && topic.trim() ? { topic: topic.trim() } : {}),
  };
}

const TYPE_INSTRUCTIONS: Record<QuestionType, (language: string) => string> = {
  DEBUG: (language) => `### DEBUG question
- Include a problem statement and a ${language} code snippet containing one genuine, realistic defect.
- The candidate must identify the root cause and submit corrected code.
- Provide EXACTLY 2 visible test cases.
- In privateEvaluation: explain the exact root cause, give the corrected code, EXACTLY 1 hidden regression test case, and a grading rubric with point allocations.`,

  SCRATCH: (language) => `### SCRATCH question
- Clear problem statement and expected behavior.
- Clear input/output requirements, constraints, and edge cases.
- Provide starter code (function signature or template) matching ${language} conventions.
- Provide EXACTLY 2 visible test cases.
- In privateEvaluation: provide a complete, working reference solution, EXACTLY 1 hidden edge/boundary test case, and a grading rubric with point allocations.
- If ${language} is SQL or database-focused, adapt test formats to schemas, fixtures, and result sets.`,

  MCQ: (language) => `### MCQ question
- A ${language} question with a clear problem statement. Include a codeSnippet only when the question needs one.
- If the question asks for program output, every option MUST be the literal printed value (e.g. "3" or "[1, 2]"), not prose.
- The code snippet must be deterministic: no random, time, input(), or file/network access.
- Provide EXACTLY 4 options with IDs A, B, C, D. Exactly one option is correct.
- Do not provide visibleTestCases or hiddenTestCases for MCQ.
- In privateEvaluation: give correctOptionId, an explanation of why the correct option is right, a reason for each wrong option that states what that option would actually produce or why it is wrong, and a grading rubric for scoring the candidate's written justification.
- Work out every answer fully before writing the JSON. Do not revise questions, options, or code inside the output. The explanation must describe only the final version.`,
};

const TYPE_EXAMPLE: Record<QuestionType, (language: string) => Record<string, unknown>> = {
  DEBUG: (language) => ({
    questionType: "DEBUG",
    title: "Question title",
    problemStatement: "Intended behavior vs. the observed bug",
    buggyCode: "Code snippet with a genuine defect",
    language,
    employeeInstructions: "Identify the root cause and submit corrected code",
    visibleTestCases: [
      { input: "sample input 1", expectedOutput: "expected output 1", description: "Standard test" },
      { input: "sample input 2", expectedOutput: "expected output 2", description: "Standard test" },
    ],
    privateEvaluation: {
      rootCause: "Detailed explanation of the defect",
      correctedCode: "Fully corrected, working code",
      hiddenTestCases: [
        { input: "hidden edge input", expectedOutput: "expected output", purpose: "Edge/regression test" },
      ],
      gradingRubric: [
        { criteria: "Root cause identification", points: 5, description: "Accurately identifies the defect" },
        { criteria: "Code correction", points: 5, description: "Provides a working fix" },
      ],
      totalPoints: 10,
    },
  }),

  SCRATCH: (language) => ({
    questionType: "SCRATCH",
    title: "Question title",
    problemStatement: "Clear problem statement and requirements",
    inputOutputRequirements: "Specification of inputs and outputs",
    constraints: ["Constraint 1"],
    edgeCases: ["Edge case 1"],
    starterCode: "Function signature or starter template",
    language,
    visibleTestCases: [
      { input: "sample input 1", expectedOutput: "expected output 1", description: "Standard test" },
      { input: "sample input 2", expectedOutput: "expected output 2", description: "Standard test" },
    ],
    privateEvaluation: {
      referenceSolution: "Complete, working reference implementation",
      hiddenTestCases: [
        { input: "hidden boundary input", expectedOutput: "expected output", purpose: "Boundary test" },
      ],
      gradingRubric: [
        { criteria: "Correctness", points: 6, description: "Passes all scenarios" },
        { criteria: "Edge case handling", points: 4, description: "Handles bounds cleanly" },
      ],
      totalPoints: 10,
    },
  }),

  MCQ: (language) => ({
    questionType: "MCQ",
    title: "Question title",
    problemStatement: "Clear question text",
    codeSnippet: "Optional code, omit if not needed",
    language,
    options: [
      { id: "A", text: "Option A" },
      { id: "B", text: "Option B" },
      { id: "C", text: "Option C" },
      { id: "D", text: "Option D" },
    ],
    privateEvaluation: {
      correctOptionId: "A",
      explanation: "Why the correct option is right",
      wrongOptionReasons: {
        B: "Why B is wrong",
        C: "Why C is wrong",
        D: "Why D is wrong",
      },
      gradingRubric: [
        { criteria: "Correct option selected", points: 4, description: "Chooses the right option" },
        { criteria: "Justification", points: 6, description: "Explains the reasoning" },
      ],
      totalPoints: 10,
    },
  }),
};

export function buildAssessmentPrompt(input: AssessmentInput): string {
  const levelInfo = PROFICIENCY_LEVELS[input.proficiencyLevel as ProficiencyLevelNumber];
  const spec = input.questionsFormat ?? DEFAULT_QUESTIONS_FORMAT;
  const total = spec.reduce((n: number, s: QuestionSpecItem) => n + s.count, 0)

  const topicLine = input.topic
    ? `Focus on the topic/area: "${input.topic}".`
    : `Select relevant practical concepts suitable for ${input.language} at level ${input.proficiencyLevel} (${levelInfo.name}).`;
  
  const distribution = spec.map((s: QuestionSpecItem) => `- Exactly ${s.count} ${s.type} question(s)`).join("\n");
  
  const typeSections = [...new Set<QuestionType>(spec.map((s: QuestionSpecItem) => s.type))]
    .map((t) => TYPE_INSTRUCTIONS[t](input.language))
    .join("\n\n");
  
  const exampleQuestions = spec
    .flatMap((s: QuestionSpecItem) => Array.from({ length: s.count }, () => TYPE_EXAMPLE[s.type](input.language)))
    .map((q: object, i: number) => ({ questionNumber: i + 1, ...q }));
  
  const exampleJson = JSON.stringify(
    {
      metadata: {
        language: input.language,
        proficiencyLevel: input.proficiencyLevel,
        proficiencyLevelName: levelInfo.name,
        topic: input.topic || `Core ${input.language}`,
        summary: "Brief summary of the assessment goals and topics covered.",
      },
      questions: exampleQuestions,
    },
    null,
    2
  );

  return `
You are an expert programming assessment generator.
Generate a practical coding assessment to evaluate a claimed proficiency in ${input.language}.

## Inputs
- Technology / Programming Language: ${input.language}
- Target Proficiency Level: ${input.proficiencyLevel} (${levelInfo.name})
- Proficiency Description: ${levelInfo.description}
${topicLine}

## Proficiency Levels Reference
1. Novice: Basic terminology, syntax, and simple constructs.
2. Learning: Common language features and straightforward debugging.
3. Skilled: Practical problem-solving, data structures, and moderately complex debugging.
4. Highly Skilled: Advanced features, subtle defects, performance, and design trade-offs.
5. Mastery: Deep technical reasoning, complex edge cases, and advanced language behavior.

Calibrate question difficulty strictly to Level ${input.proficiencyLevel} (${levelInfo.name}) and technology "${input.language}".

## Mandatory Question Distribution
Generate exactly ${total} practical coding questions:
${distribution}
Do NOT change this distribution or number of questions.

## Mandatory Test Case Requirements (Strict)
For EACH question, you MUST produce EXACTLY 3 test cases:
- Exactly TWO (2) visible test cases (\`visibleTestCases\`): Simple/standard inputs with expected outputs to help candidate verify expected behavior.
- Exactly ONE (1) hidden test case (\`hiddenTestCases\`): Boundary/edge case (Hidden Set A) used strictly on the server for scoring.
Do not provide more or fewer test cases than this exact 2 visible + 1 hidden distribution.

## Question Requirements
${typeSections}

## Quality Checks
Before returning, verify:
- The number of questions of each type matches the distribution exactly.
- Every DEBUG and SCRATCH question has EXACTLY 2 visible and EXACTLY 1 hidden test case.
- Every MCQ has EXACTLY 4 options with IDs A, B, C, D, and correctOptionId is one of them.
- For code-output MCQs, the correct option's text equals the exact output of the snippet.
- All questions match ${input.language} and Level ${input.proficiencyLevel}.
- Test cases and reference answers are consistent.
- Every question has a grading rubric with clear point allocations.
- Never claim execution or validation that did not occur.

Respond ONLY with valid JSON conforming to the following structure:
${exampleJson}
`.trim();
}
