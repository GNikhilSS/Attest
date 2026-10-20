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
