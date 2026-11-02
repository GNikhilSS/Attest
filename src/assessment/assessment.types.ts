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

export interface AssessmentInput {
  language: string;
  proficiencyLevel: number;
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

export interface EmployeeDebugQuestion {
  questionNumber: 1;
  questionType: "DEBUG";
  title: string;
  problemStatement: string;
  buggyCode: string;
  language: string;
  employeeInstructions?: string;
  visibleTestCases: TestCaseItem[];
}

export interface EmployeeScratchQuestion {
  questionNumber: 2;
  questionType: "SCRATCH";
  title: string;
  problemStatement: string;
  inputOutputRequirements?: string;
  constraints?: string[];
  edgeCases?: string[];
  starterCode?: string;
  language: string;
  visibleTestCases: TestCaseItem[];
}

export type EmployeeQuestion =
  | EmployeeDebugQuestion
  | EmployeeScratchQuestion;

export interface EmployeeFacingAssessment {
  metadata: {
    language: string;
    proficiencyLevel: ProficiencyLevelNumber;
    proficiencyLevelName: string;
    proficiencyDescription: string;
    topic?: string;
    summary: string;
    totalQuestions: 2;
  };
  questions: [EmployeeDebugQuestion, EmployeeScratchQuestion];
}

// -------------------------------------------------------------
// Private Evaluation Package (Answers, rubrics, hidden tests)
// -------------------------------------------------------------

export interface PrivateDebugEvaluation {
  questionNumber: 1;
  questionType: "DEBUG";
  title: string;
  rootCause: string;
  correctedCode: string;
  hiddenTestCases: TestCaseItem[];
  gradingRubric: RubricItem[];
  totalPoints: number;
}

export interface PrivateScratchEvaluation {
  questionNumber: 2;
  questionType: "SCRATCH";
  title: string;
  referenceSolution: string;
  hiddenTestCases: TestCaseItem[];
  gradingRubric: RubricItem[];
  totalPoints: number;
}

export type PrivateQuestionEvaluation =
  | PrivateDebugEvaluation
  | PrivateScratchEvaluation;

export interface PrivateEvaluationPackage {
  metadata: {
    language: string;
    proficiencyLevel: ProficiencyLevelNumber;
    proficiencyLevelName: string;
    evaluatedModel: string;
    generatedAt: string;
  };
  questions: [PrivateDebugEvaluation, PrivateScratchEvaluation];
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
