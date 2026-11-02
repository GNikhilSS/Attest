import "dotenv/config";
import {
  PROFICIENCY_LEVELS,
  type AssessmentGenerationResult,
  type AssessmentInput,
  type EmployeeDebugQuestion,
  type EmployeeFacingAssessment,
  type EmployeeScratchQuestion,
  type PrivateDebugEvaluation,
  type PrivateEvaluationPackage,
  type PrivateScratchEvaluation,
  type ProficiencyLevelNumber,
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
  const geminiApiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY;

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
  if (!parsedData.questions || !Array.isArray(parsedData.questions) || parsedData.questions.length !== 2) {
    throw new LLMServiceError(
      500,
      "GENERATION_FAILED",
      `Assessment generation quality check failed: Expected exactly 2 questions, got ${parsedData.questions?.length ?? 0}.`
    );
  }

  const [q1, q2] = parsedData.questions;

  if (q1.questionType !== "DEBUG") {
    throw new LLMServiceError(500, "GENERATION_FAILED", `Question 1 must be DEBUG, but got ${q1.questionType}`);
  }
  if (q2.questionType !== "SCRATCH") {
    throw new LLMServiceError(500, "GENERATION_FAILED", `Question 2 must be SCRATCH, but got ${q2.questionType}`);
  }

  const levelInfo = PROFICIENCY_LEVELS[input.proficiencyLevel as ProficiencyLevelNumber];
  const generatedAt = new Date().toISOString();

  // 7. Format Employee-Facing Assessment (Strictly 2 visible test cases per question)
  const employeeQ1: EmployeeDebugQuestion = {
    questionNumber: 1,
    questionType: "DEBUG",
    title: q1.title || "Debugging & Code Correction",
    problemStatement: q1.problemStatement || "",
    buggyCode: q1.buggyCode || "",
    language: q1.language || input.language,
    employeeInstructions:
      q1.employeeInstructions || "Identify the root cause of the bug and submit the corrected code.",
    visibleTestCases: Array.isArray(q1.visibleTestCases) ? q1.visibleTestCases.slice(0, 2) : [],
  };

  const employeeQ2: EmployeeScratchQuestion = {
    questionNumber: 2,
    questionType: "SCRATCH",
    title: q2.title || "Coding from Scratch",
    problemStatement: q2.problemStatement || "",
    inputOutputRequirements: q2.inputOutputRequirements || "",
    constraints: Array.isArray(q2.constraints) ? q2.constraints : [],
    edgeCases: Array.isArray(q2.edgeCases) ? q2.edgeCases : [],
    starterCode: q2.starterCode || undefined,
    language: q2.language || input.language,
    visibleTestCases: Array.isArray(q2.visibleTestCases) ? q2.visibleTestCases.slice(0, 2) : [],
  };

  const employeeFacing: EmployeeFacingAssessment = {
    metadata: {
      language: input.language,
      proficiencyLevel: input.proficiencyLevel as ProficiencyLevelNumber,
      proficiencyLevelName: levelInfo.name,
      proficiencyDescription: levelInfo.description,
      topic: input.topic || parsedData.metadata?.topic,
      summary: parsedData.metadata?.summary || `Assessment for ${input.language} at ${levelInfo.name} level.`,
      totalQuestions: 2,
    },
    questions: [employeeQ1, employeeQ2],
  };

  // 8. Format Private Evaluation Package (Strictly 1 hidden test case for Set A per question)
  const privateQ1: PrivateDebugEvaluation = {
    questionNumber: 1,
    questionType: "DEBUG",
    title: q1.title || employeeQ1.title,
    rootCause: q1.privateEvaluation?.rootCause || "",
    correctedCode: q1.privateEvaluation?.correctedCode || "",
    hiddenTestCases: Array.isArray(q1.privateEvaluation?.hiddenTestCases)
      ? q1.privateEvaluation.hiddenTestCases.slice(0, 1)
      : [],
    gradingRubric: Array.isArray(q1.privateEvaluation?.gradingRubric) ? q1.privateEvaluation.gradingRubric : [],
    totalPoints: q1.privateEvaluation?.totalPoints || 10,
  };

  const privateQ2: PrivateScratchEvaluation = {
    questionNumber: 2,
    questionType: "SCRATCH",
    title: q2.title || employeeQ2.title,
    referenceSolution: q2.privateEvaluation?.referenceSolution || "",
    hiddenTestCases: Array.isArray(q2.privateEvaluation?.hiddenTestCases)
      ? q2.privateEvaluation.hiddenTestCases.slice(0, 1)
      : [],
    gradingRubric: Array.isArray(q2.privateEvaluation?.gradingRubric) ? q2.privateEvaluation.gradingRubric : [],
    totalPoints: q2.privateEvaluation?.totalPoints || 10,
  };

  const privateEvaluation: PrivateEvaluationPackage = {
    metadata: {
      language: input.language,
      proficiencyLevel: input.proficiencyLevel as ProficiencyLevelNumber,
      proficiencyLevelName: levelInfo.name,
      evaluatedModel: activeModelUsed,
      generatedAt,
    },
    questions: [privateQ1, privateQ2],
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
