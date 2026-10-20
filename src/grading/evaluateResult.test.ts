
import { describe, expect, it } from "vitest";
import { evaluateResult } from "./evaluateResult.js";
import type { Judge0SubmissionResult } from "./judge0Client.js";

function makeResult(
  statusId: number,
  description: string,
  stdout: string | null = null,
): Judge0SubmissionResult {
  return {
    token: "test-token",
    status: {
      id: statusId,
      description,
    },
    stdout,
    stderr: null,
    compile_output: null,
    time: null,
    memory: null,
  };
}

describe("evaluateResult", () => {
  it("accepts matching output", () => {
    const result = makeResult(3, "Accepted", "Hello\n");

    expect(evaluateResult(result, "Hello")).toEqual({
      passed: true,
      status: "ACCEPTED",
      actualOutput: "Hello\n",
    });
  });

  it("ignores surrounding whitespace and line-ending differences", () => {
    const result = makeResult(3, "Accepted", "  Hello\r\n");

    expect(evaluateResult(result, "Hello\n")).toMatchObject({
      passed: true,
      status: "ACCEPTED",
    });
  });

  it("rejects different output", () => {
    const result = makeResult(3, "Accepted", "Goodbye");

    expect(evaluateResult(result, "Hello")).toMatchObject({
      passed: false,
      status: "WRONG_ANSWER",
    });
  });

  it("handles empty output", () => {
    const result = makeResult(3, "Accepted", null);

    expect(evaluateResult(result, "")).toMatchObject({
      passed: true,
      status: "ACCEPTED",
    });
  });

  it("returns wrong answer for status 4", () => {
    const result = makeResult(4, "Wrong Answer", "Wrong");

    expect(evaluateResult(result, "Correct")).toMatchObject({
      passed: false,
      status: "WRONG_ANSWER",
    });
  });

  it("handles time limit exceeded", () => {
    const result = makeResult(5, "Time Limit Exceeded");

    expect(evaluateResult(result, "Hello")).toMatchObject({
      passed: false,
      status: "TIME_LIMIT_EXCEEDED",
    });
  });

  it("handles compilation errors", () => {
    const result = makeResult(6, "Compilation Error");

    expect(evaluateResult(result, "Hello")).toMatchObject({
      passed: false,
      status: "COMPILATION_ERROR",
      actualOutput: null,
    });
  });

  it("handles runtime errors", () => {
    const result = makeResult(7, "Runtime Error (SIGSEGV)");

    expect(evaluateResult(result, "Hello")).toMatchObject({
      passed: false,
      status: "RUNTIME_ERROR_SIGSEGV",
    });
  });

  it("does not evaluate a queued submission", () => {
    const result = makeResult(1, "In Queue");

    expect(() => evaluateResult(result, "Hello")).toThrow(
      "SUBMISSION_NOT_FINISHED",
    );
  });

  it("does not evaluate a processing submission", () => {
    const result = makeResult(2, "Processing");

    expect(() => evaluateResult(result, "Hello")).toThrow(
      "SUBMISSION_NOT_FINISHED",
    );
  });

  it("handles unknown statuses", () => {
    const result = makeResult(99, "Unknown");

    expect(evaluateResult(result, "Hello")).toMatchObject({
      passed: false,
      status: "UNKNOWN_STATUS",
    });
  });
});
