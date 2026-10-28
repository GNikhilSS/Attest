// DONE
// - judge0Client switches to the local runner when JUDGE0_BASE_URL is “local”, with a language default of 63 for JavaScript.
// - Local results are stored by token, with a cap of 500 entries.
// - Judge0 path: submit, poll, validate the response shape, with timeouts on each request.
// - localRunner runs the candidate’s source in a node:vm context with a 2 second timeout.
// - Timeouts map to status 5, runtime errors to status 11, successful runs to status 3.

// NOT DONE
// - node:vm is not a security boundary. A candidate can still escape the context, exhaust memory, or block the event loop with a synchronous loop that the timeout cannot preempt in all cases. Must not be used for real candidates; run it in a child process or switch to Judge0.
// - The harness is not defined. The runner calls the last user-defined function with the parsed stdin, but the candidate’s function name is not fixed by the question, and a file with several helper functions picks the wrong one. Agree the wrapper format.
// - Output is derived from console.log or from the function’s return value. A candidate who logs and also returns gets only the logged output, and a function that returns an object is printed with JSON.stringify, which may not match expectedOutput formatting.
// - The stdout comparison uses trimmed text, so JSON spacing differences between expected and actual output will fail. Normalize JSON on both sides, or compare parsed values.
// - console.error is captured into stderr, which is returned to the candidate by the run endpoint. Fine for debugging, but confirm it cannot reveal hidden test inputs.
// - Local results are kept in process memory. Restarting the server loses them, so a grading job that runs after a restart fails with “Local submission not found”.
// - The token check uses startsWith(“local_”) as a fallback, so a Judge0 token could be routed to the local map if it ever began with that prefix. Keep the routing on configuration only.
// - Memory and time values are fixed placeholders (1024 and measured time), so they do not reflect real usage.
// - The 500-entry cap evicts the oldest result. A slow grading run on many tests can lose results it still needs.
// - getConfiguredLanguageId accepts “local” mode silently defaulting to 63, while remote mode requires an explicit id. Acceptable, but document it.
// - No catch for errors thrown before the try in executeLocalCode, such as token generation; unlikely to fail, but the function is not fully guarded.

import { executeLocalCode } from "./localRunner.js";

export type Judge0SubmissionRequest = {
  source_code: string;
  language_id: number;
  stdin: string;
};

export type Judge0SubmissionResponse = {
  token: string;
};

export type Judge0SubmissionResult = {
  token: string;
  status: {
    id: number;
    description: string;
  };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
};

const REQUEST_TIMEOUT_MS = 10_000;
const localResults = new Map<string, Judge0SubmissionResult>();

function isLocalRunner(): boolean {
  return process.env.JUDGE0_BASE_URL?.trim().toLowerCase() === "local";
}

export function getConfiguredLanguageId(): number {
  const configured = process.env.JUDGE0_LANGUAGE_ID?.trim();
  const languageId = !configured && isLocalRunner() ? 63 : Number(configured);

  if (!Number.isInteger(languageId) || languageId <= 0) {
    throw new Error("JUDGE0_LANGUAGE_ID is not configured correctly");
  }

  return languageId;
}

function getBaseUrl(): string {
  const baseUrl = process.env.JUDGE0_BASE_URL;

  if (!baseUrl) {
    throw new Error("JUDGE0_BASE_URL is not configured");
  }

  return baseUrl.replace(/\/+$/, "");
}

function validatePositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

export async function submitCode(
  request: Judge0SubmissionRequest,
): Promise<Judge0SubmissionResponse> {
  if (isLocalRunner()) {
    const result = executeLocalCode(request);
    localResults.set(result.token, result);
    if (localResults.size > 500) {
      const oldestKey = localResults.keys().next().value;
      if (oldestKey) localResults.delete(oldestKey);
    }
    return { token: result.token };
  }

  const baseUrl = getBaseUrl();

  const response = await fetch(
    `${baseUrl}/submissions?base64_encoded=false&wait=false`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Judge0 submission failed with HTTP status ${response.status}`,
    );
  }

  const result = (await response.json()) as Judge0SubmissionResponse;

  if (typeof result.token !== "string" || result.token.length === 0) {
    throw new Error("Judge0 response did not contain a submission token");
  }

  return result;
}

export async function getSubmissionResult(
  token: string,
): Promise<Judge0SubmissionResult> {
  if (!token.trim()) {
    throw new Error("Judge0 submission token is required");
  }

  if (isLocalRunner() || token.startsWith("local_")) {
    const localResult = localResults.get(token);
    if (!localResult) {
      throw new Error(`Local submission not found: ${token}`);
    }
    return localResult;
  }

  const baseUrl = getBaseUrl();

  const response = await fetch(
    `${baseUrl}/submissions/${encodeURIComponent(token)}?base64_encoded=false`,
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Judge0 result request failed with HTTP status ${response.status}`,
    );
  }

  const result = (await response.json()) as Judge0SubmissionResult;

  if (
    typeof result.token !== "string" ||
    !result.token ||
    !result.status ||
    typeof result.status.id !== "number" ||
    typeof result.status.description !== "string"
  ) {
    throw new Error("Invalid Judge0 submission result");
  }

  return result;
}

export function isSubmissionProcessing(statusId: number): boolean {
  return statusId === 1 || statusId === 2;
}

export async function waitForSubmissionResult(
  token: string,
  timeoutMs: number = 30_000,
  pollIntervalMs: number = 1_000,
): Promise<Judge0SubmissionResult> {
  if (!token.trim()) {
    throw new Error("Judge0 submission token is required");
  }

  validatePositiveNumber(timeoutMs, "timeoutMs");
  validatePositiveNumber(pollIntervalMs, "pollIntervalMs");

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getSubmissionResult(token);

    if (!isSubmissionProcessing(result.status.id)) {
      return result;
    }

    const elapsedTime = Date.now() - startTime;
    const remainingTime = timeoutMs - elapsedTime;

    if (remainingTime <= 0) {
      break;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(pollIntervalMs, remainingTime));
    });
  }

  throw new Error(`Judge0 submission timed out: ${token}`);
}
