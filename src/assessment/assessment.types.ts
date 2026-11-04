import type { QuestionType } from "../../generated/prisma/enums.js";

export type ProficiencyLevelNumber = 1 | 2 | 3 | 4 | 5;

export interface ProficiencyLevelInfo {
  level: ProficiencyLevelNumber;
  name: string;
  description: string;
}

export const PROFICIENCY_LEVELS: Record<ProficiencyLevelNumber, ProficiencyLevelInfo> = {
  1: {
    level: 1,
    name: "Novice",
    description: "Basic terminology, syntax, and simple constructs.",
  },
  2: {
    level: 2,
    name: "Learning",
    description: "Common language features and straightforward debugging.",
  },
  3: {
    level: 3,
    name: "Skilled",
    description: "Practical problem-solving, data structures, and moderately complex debugging.",
  },
  4: {
    level: 4,
    name: "Highly Skilled",
    description: "Advanced features, subtle defects, performance, and design trade-offs.",
  },
  5: {
    level: 5,
    name: "Mastery",
    description: "Deep technical reasoning, complex edge cases, and advanced language behavior.",
  },
};

export interface QuestionSpecItem {
  type: "DEBUG" | "SCRATCH" | "MCQ";
  count: number;
}

export const DEFAULT_QUESTIONS_FORMAT: QuestionSpecItem[] = [
  {
    type: "MCQ",
    count: 1
  },
  {
    type: "SCRATCH",
    count: 1
  },
  {
    type: "DEBUG",
    count: 1
  },
]

export interface AssessmentInput {
  language: string;
  proficiencyLevel: number;
  questionsFormat?: QuestionSpecItem[];
  topic?: string | undefined;
}

export interface RubricItem {
  criteria: string;
  points: number;
  description: string;
}

export interface TestCaseItem {
  input: string;
  expectedOutput: string;
  description?: string;
  purpose?: string;
}

// -------------------------------------------------------------
// Employee-Facing Models (No answers, hidden tests, or rubrics)
// -------------------------------------------------------------

interface BaseQuestion {
  questionNumber: number;
  questionType: QuestionType;
  title: string;
  problemStatement: string;
  language: string;
}

export interface EmployeeDebugQuestion extends BaseQuestion {
  questionType: "DEBUG";
  buggyCode: string;
  employeeInstructions?: string;
  visibleTestCases: TestCaseItem[];
}

export interface EmployeeScratchQuestion extends BaseQuestion {
  questionType: "SCRATCH";
  inputOutputRequirements?: string;
  constraints?: string[];
  edgeCases?: string[];
  starterCode?: string;
  visibleTestCases: TestCaseItem[];
}

export interface EmployeeMcqQuestion extends BaseQuestion {
  questionType: "MCQ";
  options: McqOption[]
  codeSnippet?: string;
}

export interface McqOption {
  id: "A" | "B" | "C" | "D"; 
  text: string 
}

export type EmployeeQuestion =
  | EmployeeDebugQuestion
  | EmployeeScratchQuestion
  | EmployeeMcqQuestion;

export interface EmployeeFacingAssessment {
  metadata: {
    language: string;
    proficiencyLevel: ProficiencyLevelNumber;
    proficiencyLevelName: string;
    proficiencyDescription: string;
    topic?: string;
    summary: string;
    totalQuestions: number;
  };
  questions: EmployeeQuestion[];
}

// -------------------------------------------------------------
// Private Evaluation Package (Answers, rubrics, hidden tests)
// -------------------------------------------------------------

interface BasePrivateEvaluation {
  questionNumber: number;
  questionType: QuestionType;
  title: string;
  totalPoints: number;
  gradingRubric: RubricItem[];
}

export interface PrivateDebugEvaluation extends BasePrivateEvaluation {
  questionType: "DEBUG";
  rootCause: string;
  correctedCode: string;
  hiddenTestCases: TestCaseItem[];
}

export interface PrivateScratchEvaluation extends BasePrivateEvaluation {
  questionType: "SCRATCH";
  referenceSolution: string;
  hiddenTestCases: TestCaseItem[];
}

export interface PrivateMcqEvaluation extends BasePrivateEvaluation {
  questionType: "MCQ";
  correctOptionId: "A" | "B" | "C" | "D";
  explanation: string;
  wrongOptionReasons: Record<string, string>
}

export type PrivateQuestionEvaluation =
  | PrivateDebugEvaluation
  | PrivateScratchEvaluation
  | PrivateMcqEvaluation;

export interface PrivateEvaluationPackage {
  metadata: {
    language: string;
    proficiencyLevel: ProficiencyLevelNumber;
    proficiencyLevelName: string;
    evaluatedModel: string;
    generatedAt: string;
  };
  questions: PrivateQuestionEvaluation[];
}

// -------------------------------------------------------------
// Full Assessment Generation Result
// -------------------------------------------------------------

export interface AssessmentGenerationResult {
  success: true;
  metadata: {
    language: string;
    proficiencyLevel: ProficiencyLevelNumber;
    proficiencyLevelName: string;
    model: string;
    generatedAt: string;
  };
  employeeFacing: EmployeeFacingAssessment;
  privateEvaluation: PrivateEvaluationPackage;
}
