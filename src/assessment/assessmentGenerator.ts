import { GEMINI_API_KEY, GROQ_API_KEY } from "../lib/env.js";
import { DEFAULT_QUESTIONS_FORMAT, PROFICIENCY_LEVELS } from "./assessment.types.js";
import type {
  AssessmentGenerationResult,
  AssessmentInput,
  EmployeeFacingAssessment,
  EmployeeQuestion,
  McqOption,
  PrivateEvaluationPackage,
  PrivateQuestionEvaluation,
  ProficiencyLevelNumber,
  QuestionSpecItem,
  RubricItem,
  TestCaseItem,
} from "./assessment.types.js";
import {
  buildAssessmentPrompt,
  validateAssessmentInput,
} from "./assessmentPrompt.js";

export class LLMServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: "RATE_LIMIT_EXCEEDED" | "HIGH_TRAFFIC" | "AUTH_ERROR" | "GENERATION_FAILED",
    message: string
  ) {
    super(message);
    this.name = "LLMServiceError";
  }
}

function fail(message: string): never {
  throw new LLMServiceError(500, "GENERATION_FAILED", message);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function requireTestCases(v: unknown, count: number, label: string): TestCaseItem[] {
  if (!Array.isArray(v) || v.length !== count) {
    fail(`${label}: expected ${count} test case(s), got ${Array.isArray(v) ? v.length : 0}.`);
  }
  return v.map((testcase: any) => ({
    ...testcase,
    input: String(testcase.input ?? ""),
    expectedOutput: String(testcase.expectedOutput ?? ""),
  }));
}

function requireOptions(v: unknown, label: string): McqOption[] {
  if (!Array.isArray(v) || v.length !== 4) {
    fail(`${label}: MCQ needs exactly 4 options.`);
  }
  const ids = v.map((o: any) => o?.id);
  if (JSON.stringify(ids) !== JSON.stringify(["A", "B", "C", "D"])) {
    fail(`${label}: option IDs must be A, B, C, D in that order.`);
  }
  return v.map((o: any) => ({ id: o.id, text: str(o.text) }));
}

function buildQuestionPair(
  raw: any,
  questionNumber: number,
  language: string,
): { employee: EmployeeQuestion; privateEval: PrivateQuestionEvaluation } {
  const label = `Question ${questionNumber}`;
  const title = str(raw.title) || label;
  const problemStatement = str(raw.problemStatement);
  const questionLanguage = str(raw.language) || language;
  const pk = raw.privateEvaluation ?? {};
  const totalPoints: number = typeof pk.totalPoints === "number" ? pk.totalPoints : 10;
  const gradingRubric: RubricItem[] = Array.isArray(pk.gradingRubric) ? pk.gradingRubric : [];

  if (!problemStatement) fail(`${label}: missing problemStatement.`);
  if (gradingRubric.length === 0) fail(`${label}: missing gradingRubric.`);

  switch (raw.questionType) {
    case "DEBUG":
      return {
        employee: {
          questionNumber, title, problemStatement, 
          language: questionLanguage,
          questionType: "DEBUG",
          buggyCode: str(raw.buggyCode),
          employeeInstructions:
            str(raw.employeeInstructions) || "Identify the root cause of the bug and submit the corrected code.",
          visibleTestCases: requireTestCases(raw.visibleTestCases, 2, label),
        },
        privateEval: {
          questionNumber, title, totalPoints, gradingRubric,
          questionType: "DEBUG",
          rootCause: str(pk.rootCause),
          correctedCode: str(pk.correctedCode),
          hiddenTestCases: requireTestCases(pk.hiddenTestCases, 1, label),
        },
      };
    
    case "SCRATCH": {
      const starter = str(raw.starterCode);
      return {
        employee: {
          questionNumber, title, problemStatement, 
          language: questionLanguage,
          questionType: "SCRATCH",
          inputOutputRequirements: str(raw.inputOutputRequirements),
          constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
          edgeCases: Array.isArray(raw.edgeCases) ? raw.edgeCases : [],
          ...(starter ? { starterCode: starter } : {}),
          visibleTestCases: requireTestCases(raw.visibleTestCases, 2, label),
        },
        privateEval: {
          questionNumber, title, totalPoints, gradingRubric,
          questionType: "SCRATCH",
          referenceSolution: str(pk.referenceSolution),
          hiddenTestCases: requireTestCases(pk.hiddenTestCases, 1, label),
        },
      }
    }

    case "MCQ": {
      const options = requireOptions(raw.options, label);
      const correctOptionId = pk.correctOptionId;
      if (!options.some((o) => o.id === correctOptionId)) {
        fail(`${label}: correctOptionId "${correctOptionId}" is not one of the options.`);
      }

      const wrongOptionReasons: Record<string, string> =
        pk.wrongOptionReasons && typeof pk.wrongOptionReasons === "object"
          ? pk.wrongOptionReasons
          : {};

      const wrongIds = options.map((o) => o.id).filter((id) => id !== correctOptionId);
      for (const id of wrongIds) {
        if (!str(wrongOptionReasons[id])) {
          fail(`${label}: missing wrongOptionReasons for option ${id}.`);
        }
      }

      const snippet = str(raw.codeSnippet);
      return {
        employee: {
          questionNumber, title, problemStatement, 
          language: questionLanguage,
          questionType: "MCQ",
          options,
          ...(snippet ? { codeSnippet: snippet } : {}),
        },
        privateEval: {
          questionNumber, title, totalPoints, gradingRubric,
          questionType: "MCQ",
          correctOptionId,
          explanation: str(pk.explanation),
          wrongOptionReasons,
        },
      };
    }

    default:
      return fail(`${label}: unknown questionType "${raw.questionType}".`);
  }
}

export interface GenerateAssessmentOptions {
  model?: string;
  fallbackModel?: string;
  apiKey?: string;
  groqApiKey?: string;
  groqModel?: string;
  maxRetries?: number;
}

const DEFAULT_PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

async function callGeminiApi(
  model: string,
  apiKey: string,
  prompt: string,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      const data = (await response.json()) as any;

      if (response.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data;
      }

      const status = response.status;
      const errorMessage = data?.error?.message || response.statusText || "Unknown error";

      // 401 / 403: Authentication issues (fail immediately)
      if (status === 401 || status === 403) {
        throw new LLMServiceError(
          status,
          "AUTH_ERROR",
          `Gemini API authentication failed: ${errorMessage}`
        );
      }

      // 503 = high demand / unavailable, 429 = rate limit -> retry with exponential backoff
      if (status === 503 || status === 429) {
        console.warn(
          `[Gemini] ${model} attempt ${attempt}/${maxRetries} encountered ${status} (${errorMessage}). Waiting before retry...`
        );
        if (attempt < maxRetries) {
          // Exponential backoff: 2.5s, 5s, 7.5s
          await new Promise((resolve) => setTimeout(resolve, attempt * 2500));
          continue;
        }

        throw new LLMServiceError(
          status,
          status === 429 ? "RATE_LIMIT_EXCEEDED" : "HIGH_TRAFFIC",
          status === 429
            ? "Gemini API rate limit or quota exceeded. Please wait a moment before trying again."
            : "Gemini model is currently experiencing high demand. Please try again shortly."
        );
      }

      throw new LLMServiceError(
        status >= 400 && status < 600 ? status : 500,
        "GENERATION_FAILED",
        `Gemini API error (${status}): ${errorMessage}`
      );
    } catch (err: any) {
      if (err instanceof LLMServiceError && (err.code === "AUTH_ERROR" || attempt >= maxRetries)) {
        throw err;
      }

      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        continue;
      }
      break;
    }
  }

  throw lastError || new LLMServiceError(500, "GENERATION_FAILED", `Failed to generate assessment with model ${model}`);
}

async function callGroqApi(
  apiKey: string,
  prompt: string,
  model: string = DEFAULT_GROQ_MODEL
): Promise<{ rawJsonText: string; modelUsed: string }> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert programming assessment generator. Output valid JSON only adhering strictly to the requested schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  const data = (await response.json()) as any;
  if (!response.ok) {
    const errorMsg = data?.error?.message || response.statusText || "Groq API error";
    throw new LLMServiceError(
      response.status >= 400 && response.status < 600 ? response.status : 500,
      "GENERATION_FAILED",
      `Groq API error (${response.status}): ${errorMsg}`
    );
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMServiceError(500, "GENERATION_FAILED", "Empty response from Groq API");
  }

  return {
    rawJsonText: content,
    modelUsed: `groq/${model}`,
  };
}

export async function generateAssessment(
  rawInput: unknown,
  options: GenerateAssessmentOptions = {}
): Promise<AssessmentGenerationResult> {
  // 1. Validate inputs (throws AssessmentInputError if missing or invalid)
  const input: AssessmentInput = validateAssessmentInput(rawInput);

  // 2. Resolve API keys
  const geminiApiKey = options.apiKey || GEMINI_API_KEY;
  const groqApiKey = options.groqApiKey || GROQ_API_KEY;

  if (!geminiApiKey && !groqApiKey) {
    throw new LLMServiceError(
      500,
      "AUTH_ERROR",
      "No LLM API keys configured. Please define GEMINI_API_KEY or GROQ_API_KEY in your .env file."
    );
  }

  const primaryModel = options.model || DEFAULT_PRIMARY_MODEL;
  const fallbackModel = options.fallbackModel || DEFAULT_FALLBACK_MODEL;
  const groqModel = options.groqModel || DEFAULT_GROQ_MODEL;
  const maxRetries = options.maxRetries ?? 3;

  // 3. Build prompt
  const prompt = buildAssessmentPrompt(input);

  // 4. Multi-Tier Execution:
  //    Tier 1: Primary Gemini Model (with retries)
  //    Tier 2: Secondary Gemini Fallback Model
  //    Tier 3: Cross-Provider Fallback to Groq API
  let responseText: string = "";
  let activeModelUsed = primaryModel;
  let generationSucceeded = false;

  if (geminiApiKey) {
    try {
      const apiResponse = await callGeminiApi(primaryModel, geminiApiKey, prompt, maxRetries);
      responseText = apiResponse.candidates[0].content.parts[0].text;
      activeModelUsed = primaryModel;
      generationSucceeded = true;
    } catch (primaryErr: any) {
      console.warn(
        `[AssessmentGenerator] Primary Gemini (${primaryModel}) failed: ${primaryErr.message}. Attempting secondary Gemini fallback...`
      );

      if (fallbackModel && fallbackModel !== primaryModel) {
        try {
          const apiResponse = await callGeminiApi(fallbackModel, geminiApiKey, prompt, 2);
          responseText = apiResponse.candidates[0].content.parts[0].text;
          activeModelUsed = fallbackModel;
          generationSucceeded = true;
        } catch (fallbackErr: any) {
          console.warn(
            `[AssessmentGenerator] Secondary Gemini (${fallbackModel}) also failed: ${fallbackErr.message}.`
          );
        }
      }
    }
  }

  // Tier 3: If Gemini failed or is unavailable, use Groq
  if (!generationSucceeded) {
    if (groqApiKey) {
      console.log(
        `[AssessmentGenerator] Initiating cross-provider fallback to Groq (${groqModel})...`
      );
      try {
        const groqResponse = await callGroqApi(groqApiKey, prompt, groqModel);
        responseText = groqResponse.rawJsonText;
        activeModelUsed = groqResponse.modelUsed;
        generationSucceeded = true;
        console.log(`[AssessmentGenerator] Assessment generated successfully via Groq (${groqModel}).`);
      } catch (groqErr: any) {
        console.error(`[AssessmentGenerator] Groq fallback failed: ${groqErr.message}`);
        throw groqErr;
      }
    } else {
      throw new LLMServiceError(
        503,
        "HIGH_TRAFFIC",
        "Gemini service is unavailable and no GROQ_API_KEY fallback is configured."
      );
    }
  }

  // 5. Parse structured JSON from response
  let parsedData: any;
  try {
    parsedData = JSON.parse(responseText);
  } catch (err: any) {
    throw new LLMServiceError(
      500,
      "GENERATION_FAILED",
      `Failed to parse LLM JSON output: ${err.message}`
    );
  }

  // 6. Quality Checks & Verification (Exactly 2 questions: DEBUG and SCRATCH)
  const spec = input.questionsFormat ?? DEFAULT_QUESTIONS_FORMAT;
  const rawQuestions: unknown = parsedData.questions;

  if (!Array.isArray(rawQuestions)) {
    fail("Assessment generation quality check failed: 'questions' is not an array.");
  }

  const expectedTotal = spec.reduce((sum: number, s: QuestionSpecItem) => sum + s.count, 0);
  if (rawQuestions.length !== expectedTotal) {
    fail(`Assessment generation quality check failed: expected ${expectedTotal} questions, got ${rawQuestions.length}.`);
  }

  const actualCounts = new Map<string, number>();
  for (const q of rawQuestions as any[]) {
    const t = q?.questionType;
    actualCounts.set(t, (actualCounts.get(t) ?? 0) + 1);
  }
  for (const { type, count } of spec) {
    const got = actualCounts.get(type) ?? 0;
    if (got !== count) {
      fail(`Assessment generation quality check failed: expected ${count} ${type} question(s), got ${got}.`);
    }
  }

  // 7. Format Employee-Facing Assessment (Strictly 2 visible test cases per question)
  const built = (rawQuestions as any[]).map((raw, index) =>
    buildQuestionPair(raw, index + 1, input.language)
  );
  const employeeQuestions = built.map((b) => b.employee);
  const privateQuestions = built.map((b) => b.privateEval);

  const levelInfo = PROFICIENCY_LEVELS[input.proficiencyLevel as ProficiencyLevelNumber];
  const generatedAt = new Date().toISOString();

  const employeeFacing: EmployeeFacingAssessment = {
    metadata: {
      language: input.language,
      proficiencyLevel: input.proficiencyLevel as ProficiencyLevelNumber,
      proficiencyLevelName: levelInfo.name,
      proficiencyDescription: levelInfo.description,
      topic: input.topic || parsedData.metadata?.topic,
      summary: parsedData.metadata?.summary || `Assessment for ${input.language} at ${levelInfo.name} level.`,
      totalQuestions: employeeQuestions.length,
    },
    questions: employeeQuestions,
  };

  const privateEvaluation: PrivateEvaluationPackage = {
    metadata: {
      language: input.language,
      proficiencyLevel: input.proficiencyLevel as ProficiencyLevelNumber,
      proficiencyLevelName: levelInfo.name,
      evaluatedModel: activeModelUsed,
      generatedAt,
    },
    questions: privateQuestions,
  };

  return {
    success: true,
    metadata: {
      language: input.language,
      proficiencyLevel: input.proficiencyLevel as ProficiencyLevelNumber,
      proficiencyLevelName: levelInfo.name,
      model: activeModelUsed,
      generatedAt,
    },
    employeeFacing,
    privateEvaluation,
  };
}
