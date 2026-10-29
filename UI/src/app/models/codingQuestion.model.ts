export interface CodingQuestion {
  id?: string;
  title: string;
  description: string;
  testCases: TestCase[];
  functionSignature: FunctionSignature;
  functionName: string;
}

export interface FunctionSignature {
  arguments: FunctionArgument[];
  returnType: string;
}

export interface FunctionArgument {
  name: string;
  type: string;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface CodingSubmission {
  codingSubmissionId: string;
  questionId: string;
  userCode: string;
  language: string;
  userId: string;
  createdAt: string; // ISO 8601 formatted date
  score: number; // e.g., 90/100
}
export interface CodeExecution {
  code: string;
  input: string;
  language: string;
}

export interface Status {
  id: number;
  description: string;
}

export interface CodeExecutionResult {
  status?: string;
  stdout?: string | null;
  stderr?: string | null;
  compileOutput?: string | null;
  time?: string | null;
  memory?: number | null;
  message?: string;
}

export interface VisibleTestCase {
  id?: number | string;
  input: string;
  expectedOutput: string;
  visibility?: string;
}

export interface TestCaseRunResult {
  testCaseNumber: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  executionError?: string;
}

export interface SingleTestResult {
  passed: boolean;
  status: string;
  actualOutput: string;
}

export interface RunAllTestsResult {
  results: {
    visibleinput: string;
    expectedOutput?: string;
    result: SingleTestResult;
  }[];
}