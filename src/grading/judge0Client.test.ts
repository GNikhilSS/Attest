import {
  afterEach,beforeEach,describe,expect,it,vi, } from "vitest";

import {
  getSubmissionResult,
  isSubmissionProcessing,
  submitCode,
  waitForSubmissionResult,
} from "./judge0Client.js";

const BASE_URL = "http://localhost:2358";

const mockRequest = {
  source_code: "print(input())",
  language_id: 71,
  stdin: "Hello",
};

function mockResponse(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function makeResult(
  statusId: number,
  description: string,
) {
  return {
    token: "test-token",
    status: {
      id: statusId,
      description,
    },
    stdout: statusId === 3 ? "Hello\n" : null,
    stderr: null,
    compile_output: null,
    time: statusId === 3 ? "0.01" : null,
    memory: statusId === 3 ? 1024 : null,
  };
}

describe("isSubmissionProcessing", () => {
  it("returns true when a submission is queued", () => {
    expect(isSubmissionProcessing(1)).toBe(true);
  });

  it("returns true when a submission is processing", () => {
    expect(isSubmissionProcessing(2)).toBe(true);
  });

  it("returns false for a completed submission", () => {
    expect(isSubmissionProcessing(3)).toBe(false);
  });

  it("returns false for a compilation error", () => {
    expect(isSubmissionProcessing(6)).toBe(false);
  });
});

describe("submitCode", () => {
  beforeEach(() => {
    process.env.JUDGE0_BASE_URL = BASE_URL;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("submits code and returns the submission token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ token: "test-token" }),
    );

    const result = await submitCode(mockRequest);

    expect(result).toEqual({ token: "test-token" });
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/submissions?base64_encoded=false&wait=false`,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mockRequest),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("throws when the base URL is not configured", async () => {
    delete process.env.JUDGE0_BASE_URL;

    await expect(submitCode(mockRequest)).rejects.toThrow(
      "JUDGE0_BASE_URL is not configured",
    );
  });

  it("throws when Judge0 returns an HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ error: "Bad request" }, 400),
    );

    await expect(submitCode(mockRequest)).rejects.toThrow(
      "Judge0 submission failed with HTTP status 400",
    );
  });

  it("throws when the response does not contain a token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({}),
    );

    await expect(submitCode(mockRequest)).rejects.toThrow(
      "Judge0 response did not contain a submission token",
    );
  });
});

describe("getSubmissionResult", () => {
  beforeEach(() => {
    process.env.JUDGE0_BASE_URL = BASE_URL;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("retrieves the current submission result", async () => {
    const result = makeResult(3, "Accepted");

    vi.mocked(fetch).mockResolvedValue(mockResponse(result));

    await expect(
      getSubmissionResult("test-token"),
    ).resolves.toEqual(result);

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/submissions/test-token?base64_encoded=false`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("encodes the token in the URL", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(makeResult(2, "Processing")),
    );

    await getSubmissionResult("token/with spaces");

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/submissions/token%2Fwith%20spaces?base64_encoded=false`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("throws when the base URL is not configured", async () => {
    delete process.env.JUDGE0_BASE_URL;

    await expect(
      getSubmissionResult("test-token"),
    ).rejects.toThrow("JUDGE0_BASE_URL is not configured");
  });

  it("throws when Judge0 returns an HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({}, 500),
    );

    await expect(
      getSubmissionResult("test-token"),
    ).rejects.toThrow(
      "Judge0 result request failed with HTTP status 500",
    );
  });

  it("throws when the result has no token or status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ token: "test-token" }),
    );

    await expect(
      getSubmissionResult("test-token"),
    ).rejects.toThrow("Invalid Judge0 submission result");
  });
});

describe("waitForSubmissionResult", () => {
  beforeEach(() => {
    process.env.JUDGE0_BASE_URL = BASE_URL;
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns immediately when the submission is complete", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(makeResult(3, "Accepted")),
    );

    const promise = waitForSubmissionResult(
      "test-token",
      5_000,
      1_000,
    );

    await expect(promise).resolves.toMatchObject({
      status: {
        id: 3,
        description: "Accepted",
      },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("polls again when the submission is queued", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        mockResponse(makeResult(1, "In Queue")),
      )
      .mockResolvedValueOnce(
        mockResponse(makeResult(3, "Accepted")),
      );

    const promise = waitForSubmissionResult(
      "test-token",
      5_000,
      1_000,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toMatchObject({
      status: {
        id: 3,
        description: "Accepted",
      },
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns terminal errors for the evaluator to handle", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(makeResult(6, "Compilation Error")),
    );

    await expect(
      waitForSubmissionResult("test-token", 5_000, 1_000),
    ).resolves.toMatchObject({
      status: {
        id: 6,
        description: "Compilation Error",
      },
    });
  });

  it("throws when the polling timeout is reached", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      mockResponse(makeResult(1, "In Queue")),
    );

    const promise = waitForSubmissionResult(
      "test-token",
      2_000,
      1_000,
    );

    const assertion = expect(promise).rejects.toThrow(
      "Judge0 submission timed out: test-token",
    );

    await vi.advanceTimersByTimeAsync(2_000);

    await assertion;
  });
});
