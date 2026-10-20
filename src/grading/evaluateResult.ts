import type { Judge0SubmissionResult } from "./judge0Client.js";

export type TestCaseResult = {
  passed: boolean;
  status: string;
  actualOutput: string | null;
};

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, "\n").trim();
}

export function evaluateResult(
  result: Judge0SubmissionResult,
  expectedOutput: string,
): TestCaseResult {
  const statusId = result.status.id;

  // The program is still queued or running.
  if (statusId === 1 || statusId === 2) {
    throw new Error("SUBMISSION_NOT_FINISHED");
  }

  // The program ran, but its output was incorrect.
  if (statusId === 4) {
    return {
      passed: false,
      status: "WRONG_ANSWER",
      actualOutput: result.stdout,
    };
  }

  // The program exceeded its execution time limit.
  if (statusId === 5) {
    return {
      passed: false,
      status: "TIME_LIMIT_EXCEEDED",
      actualOutput: result.stdout,
    };
  }

  // The program failed to compile.
  if (statusId === 6) {
    return {
      passed: false,
      status: "COMPILATION_ERROR",
      actualOutput: null,
    };
  }

  // Other execution failures, including runtime errors.
  if (statusId >= 7 && statusId <= 12) {
    return {
      passed: false,
      status: result.status.description
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
      actualOutput: result.stdout,
    };
  }

  // Only compare output for a successfully executed program.
  if (statusId !== 3) {
    return {
      passed: false,
      status: "UNKNOWN_STATUS",
      actualOutput: result.stdout,
    };
  }

  const actualOutput = result.stdout ?? "";

  const passed =
    normalizeOutput(actualOutput) ===
    normalizeOutput(expectedOutput);

  return {
    passed,
    status: passed ? "ACCEPTED" : "WRONG_ANSWER",
    actualOutput: result.stdout,
  };
}
