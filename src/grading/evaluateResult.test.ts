import { describe, expect, it } from "vitest";
import { evaluateResult } from "./evaluateResult.js";

describe("evaluateResult", () => {
  it("marks as ACCEPTED when output matches expectedOutput", () => {
    const result = {
      token: "tok_1",
      status: { id: 3, description: "Accepted" },
      stdout: "42\n",
      stderr: null,
      compile_output: null,
      time: "0.01",
      memory: 1024,
    };

    const evaluated = evaluateResult(result, "42");
    expect(evaluated.passed).toBe(true);
    expect(evaluated.status).toBe("ACCEPTED");
  });

  it("marks as WRONG_ANSWER when output does not match", () => {
    const result = {
      token: "tok_2",
      status: { id: 3, description: "Accepted" },
      stdout: "100\n",
      stderr: null,
      compile_output: null,
      time: "0.01",
      memory: 1024,
    };

    const evaluated = evaluateResult(result, "42");
    expect(evaluated.passed).toBe(false);
    expect(evaluated.status).toBe("WRONG_ANSWER");
  });

  it("handles compilation errors", () => {
    const result = {
      token: "tok_3",
      status: { id: 6, description: "Compilation Error" },
      stdout: null,
      stderr: null,
      compile_output: "Syntax error",
      time: null,
      memory: null,
    };

    const evaluated = evaluateResult(result, "42");
    expect(evaluated.passed).toBe(false);
    expect(evaluated.status).toBe("COMPILATION_ERROR");
  });
});
