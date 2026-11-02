import {
  PROFICIENCY_LEVELS,
  type AssessmentInput,
  type ProficiencyLevelNumber,
} from "./assessment.types.js";

export class AssessmentInputError extends Error {
  constructor(message: string, public readonly clarificationNeeded: string) {
    super(message);
    this.name = "AssessmentInputError";
  }
}

export function validateAssessmentInput(input: unknown): AssessmentInput {
  if (!input || typeof input !== "object") {
    throw new AssessmentInputError(
      "Missing request payload.",
      "Please provide the programming language or technology and the proficiency level (1 to 5)."
    );
  }

  const { language, proficiencyLevel, topic } = input as Record<string, unknown>;

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
    ...(typeof topic === "string" && topic.trim() ? { topic: topic.trim() } : {}),
  };
}

export function buildAssessmentPrompt(input: AssessmentInput): string {
  const levelInfo = PROFICIENCY_LEVELS[input.proficiencyLevel as ProficiencyLevelNumber];
  const topicInstruction = input.topic
    ? `Focus on the topic/area: "${input.topic}".`
    : `Select relevant practical concepts suitable for ${input.language} at level ${input.proficiencyLevel} (${levelInfo.name}).`;

  return `
You are an expert programming assessment generator.
Generate a practical coding assessment to evaluate a claimed proficiency in ${input.language}.

## Inputs
- Technology / Programming Language: ${input.language}
- Target Proficiency Level: ${input.proficiencyLevel} (${levelInfo.name})
- Proficiency Description: ${levelInfo.description}
${topicInstruction}

## Proficiency Levels Reference
1. Novice: Basic terminology, syntax, and simple constructs.
2. Learning: Common language features and straightforward debugging.
3. Skilled: Practical problem-solving, data structures, and moderately complex debugging.
4. Highly Skilled: Advanced features, subtle defects, performance, and design trade-offs.
5. Mastery: Deep technical reasoning, complex edge cases, and advanced language behavior.

Calibrate question difficulty strictly to Level ${input.proficiencyLevel} (${levelInfo.name}) and technology "${input.language}".

## Mandatory Question Distribution
Generate exactly two practical coding questions:
1. Question 1: One debugging and code-correction question with a genuine defect.
2. Question 2: One coding-from-scratch question.
Do NOT change this distribution or number of questions.

## Mandatory Test Case Requirements (Strict)
For EACH question, you MUST produce EXACTLY 3 test cases:
- Exactly TWO (2) visible test cases (\`visibleTestCases\`): Simple/standard inputs with expected outputs to help candidate verify expected behavior.
- Exactly ONE (1) hidden test case (\`hiddenTestCases\`): Boundary/edge case (Hidden Set A) used strictly on the server for scoring.
Do not provide more or fewer test cases than this exact 2 visible + 1 hidden distribution.

## Detailed Question Requirements

### Question 1: Debugging and Code-Correction
- Include a problem statement and a code snippet containing a genuine, realistic defect.
- Request candidate to identify and explain the root cause and provide corrected code.
- Provide EXACTLY 2 visible test cases.
- In private evaluation: explain the exact root cause, provide the corrected reference code, EXACTLY 1 hidden regression test case (Set A), and a clear grading rubric with point allocations.

### Question 2: Coding from Scratch
- Clear problem statement and expected behavior.
- Clear input/output requirements, constraints, and edge cases.
- Provide starter code (function signature or template) matching ${input.language} conventions.
- Provide EXACTLY 2 visible test cases.
- In private evaluation: provide a complete, working reference solution, EXACTLY 1 hidden edge/boundary test case (Set A), and a grading rubric with point allocations.
- (If ${input.language} is SQL or database-focused, adapt test formats to schemas, fixtures, and result sets instead of function calls).

## Quality Checks
Before returning, verify:
- Exactly two questions follow the required distribution (Question 1 = DEBUG, Question 2 = SCRATCH).
- Every question has EXACTLY 2 visible test cases and EXACTLY 1 hidden test case.
- All questions match ${input.language} and Level ${input.proficiencyLevel}.
- The debugging snippet contains a genuine defect and valid correction.
- The scratch problem is unambiguous and solvable.
- Test cases and reference answers are consistent.
- Every question has a grading rubric with clear point allocations.
- Never claim execution or validation that did not occur.

Respond ONLY with valid JSON conforming to the following structure:
{
  "metadata": {
    "language": "${input.language}",
    "proficiencyLevel": ${input.proficiencyLevel},
    "proficiencyLevelName": "${levelInfo.name}",
    "topic": "${input.topic || "Core " + input.language}",
    "summary": "Brief summary of the assessment goals and topics covered."
  },
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "DEBUG",
      "title": "Question title",
      "problemStatement": "Problem statement describing intended behavior vs bug",
      "buggyCode": "Code snippet with genuine defect",
      "language": "${input.language}",
      "employeeInstructions": "Identify root cause and submit corrected code",
      "visibleTestCases": [
        { "input": "sample input 1", "expectedOutput": "expected output 1", "description": "Standard visible test 1" },
        { "input": "sample input 2", "expectedOutput": "expected output 2", "description": "Standard visible test 2" }
      ],
      "privateEvaluation": {
        "rootCause": "Detailed explanation of the genuine defect",
        "correctedCode": "Fully corrected, working code",
        "hiddenTestCases": [
          { "input": "hidden edge input", "expectedOutput": "expected output", "purpose": "Hidden Set A regression/edge test" }
        ],
        "gradingRubric": [
          { "criteria": "Root cause identification", "points": 5, "description": "Accurately identifies defect" },
          { "criteria": "Code correction", "points": 5, "description": "Provides working bug fix" }
        ],
        "totalPoints": 10
      }
    },
    {
      "questionNumber": 2,
      "questionType": "SCRATCH",
      "title": "Question title",
      "problemStatement": "Clear problem statement and requirements",
      "inputOutputRequirements": "Specification of input arguments and returned output",
      "constraints": ["Constraint 1", "Constraint 2"],
      "edgeCases": ["Edge case 1", "Edge case 2"],
      "starterCode": "Function signature or starter template",
      "language": "${input.language}",
      "visibleTestCases": [
        { "input": "sample input 1", "expectedOutput": "expected output 1", "description": "Standard visible test 1" },
        { "input": "sample input 2", "expectedOutput": "expected output 2", "description": "Standard visible test 2" }
      ],
      "privateEvaluation": {
        "referenceSolution": "Complete, optimal reference implementation",
        "hiddenTestCases": [
          { "input": "hidden boundary input", "expectedOutput": "expected output", "purpose": "Hidden Set A boundary/edge test" }
        ],
        "gradingRubric": [
          { "criteria": "Correctness & logic", "points": 6, "description": "Passes all scenarios" },
          { "criteria": "Edge case handling & efficiency", "points": 4, "description": "Handles bounds cleanly" }
        ],
        "totalPoints": 10
      }
    }
  ]
}
`.trim();
}
