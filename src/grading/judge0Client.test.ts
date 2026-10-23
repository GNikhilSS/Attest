import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSubmissionProcessing,
  submitCode,
  waitForSubmissionResult,
} from "./judge0Client.js";

describe("judge0Client", () => {
  beforeEach(() => {
    vi.stubEnv("JUDGE0_BASE_URL", "http://localhost:2358");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("identifies processing statuses", () => {
    expect(isSubmissionProcessing(1)).toBe(true); // In Queue
    expect(isSubmissionProcessing(2)).toBe(true); // Processing
    expect(isSubmissionProcessing(3)).toBe(false); // Accepted
  });

  it("submits code and returns token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "submission-token-123" }),
    } as Response);

    const res = await submitCode({
      source_code: "print(1)",
      language_id: 71,
      stdin: "",
    });

    expect(res.token).toBe("submission-token-123");
  });

  it("waits and returns completed submission result", async () => {
    const mockResult = {
      token: "tok_123",
      status: { id: 3, description: "Accepted" },
      stdout: "hello",
      stderr: null,
      compile_output: null,
      time: "0.01",
      memory: 1024,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const res = await waitForSubmissionResult("tok_123", 5000, 100);
    expect(res).toEqual(mockResult);
  });

  describe("local runner mode (JUDGE0_BASE_URL=local)", () => {
    beforeEach(() => {
      vi.stubEnv("JUDGE0_BASE_URL", "local");
    });

    it("executes JavaScript function and returns evaluation result", async () => {
      const submission = await submitCode({
        source_code: "function sum(arr) { return arr.reduce((a, b) => a + b, 0); }",
        language_id: 63,
        stdin: "[1, 2, 3]",
      });

      expect(submission.token).toMatch(/^local_/);

      const result = await waitForSubmissionResult(submission.token);
      expect(result.status.id).toBe(3);
      expect(result.stdout).toBe("6");
    });

    it("handles JavaScript console.log output", async () => {
      const submission = await submitCode({
        source_code: "console.log('hello from test');",
        language_id: 63,
        stdin: "",
      });

      const result = await waitForSubmissionResult(submission.token);
      expect(result.status.id).toBe(3);
      expect(result.stdout).toBe("hello from test");
    });

    it("handles runtime errors gracefully", async () => {
      const submission = await submitCode({
        source_code: "foo.bar();",
        language_id: 63,
        stdin: "",
      });

      const result = await waitForSubmissionResult(submission.token);
      expect(result.status.id).toBe(11); // Runtime Error
      expect(result.stderr).toContain("foo is not defined");
    });
  });
});
