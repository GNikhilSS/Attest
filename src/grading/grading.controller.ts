//DONE
// - Routes: run, saveDraft, submit, and report, each mapped to its handler.
// - Shared getAttempt checks the id format, existence (404), ownership (403), and that the question belongs to the attempt.
// - saveDraft updates the existing draft or creates one, and only while IN_PROGRESS.
// - submitAttempt finalizes drafts and transitions to SUBMITTED in one transaction, then grades in the background.
// - getGradingReport returns the report only to the owner.

// NOT DONE
// - getAttempt takes res and writes responses itself, mixing data loading with HTTP. Throw errors and let the global handler respond, as the rest of the code does.
// - runCode and saveDraft wrap everything in try/catch, which conflicts with the global error handler you chose. Remove them.
// - getAttempt on the report route loads every question’s submissions for no reason; load only the report.
// - Submit returns 202 while grading runs; the response says gradingStatus PENDING but nothing tells the client how to check progress except the report route. Document that.
// - Submit with no drafts still transitions; a candidate can submit with zero answers. Decide if that is allowed.
// - Submit after deadline: the transition throws DEADLINE_PASSED, but the attempt stays IN_PROGRESS until the sweep. That’s correct, but the message should tell the candidate their answers were not saved.
// - saveDraft and runCode check IN_PROGRESS but not the deadline, so drafts can still be saved after the deadline until the sweep runs. Add the deadline check, as for events.
// - runCode uses getConfiguredLanguageId but accepts any sourceCode size and stdin size; add caps and rate limits.
// - runCode returns Judge0 stderr and compile output to the candidate; acceptable for debugging, but confirm it does not leak hidden test data through error messages.
// - submitAttempt’s catch maps DEADLINE_PASSED and INVALID_TRANSITION inline, duplicating the global error mapping; remove once the handler covers them.
// - Routes file uses no validation library, while the attempts routes use Zod; make them consistent.
// - The background grading call has no retry or visibility beyond the console.

import type { Request, Response } from "express";
import type { AuthedRequest } from "../auth/auth.types.js";
import { AttemptStatus, Visibility } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { transitionAttemptInTransaction } from "../attempts/attemptStateMachine.js";
import { gradeAttempt } from "./gradingWorker.js";
import { getConfiguredLanguageId, submitCode, waitForSubmissionResult } from "./judge0Client.js";
import { evaluateResult } from "./evaluateResult.js";

// Validates attempt ID and checks ownership by the authenticated employee
async function getAttempt(req: Request, res: Response, questionId?: number) {
  const attemptId = Number(req.params.attemptId);
  const employeeId = (req as AuthedRequest).employee?.employeeId;

  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    res.status(400).json({ message: "Invalid attempt ID" });
    return null;
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      questions: questionId ? { where: { questionId } } : { select: { questionId: true } },
      gradingReport: true,
    },
  });

  if (!attempt) {
    res.status(404).json({ message: "Attempt not found" });
    return null;
  }
  if (attempt.employeeId !== employeeId) {
    res.status(403).json({ message: "You do not own this attempt" });
    return null;
  }
  if (questionId && attempt.questions.length === 0) {
    res.status(404).json({ message: "Question does not belong to this attempt" });
    return null;
  }

  return { attempt, attemptId, employeeId };
}

// POST /grading/:attemptId/questions/:questionId/run
export const runCode = async (req: Request, res: Response) => {
  try {
    const questionId = Number(req.params.questionId);
    const { sourceCode, stdin } = req.body;

    if (!Number.isInteger(questionId) || questionId <= 0) {
      return res.status(400).json({ message: "Invalid question ID" });
    }
    if (typeof sourceCode !== "string" || !sourceCode.trim() || typeof stdin !== "string") {
      return res.status(400).json({ message: "sourceCode and stdin are required" });
    }

    const ctx = await getAttempt(req, res, questionId);
    if (!ctx) return;

    if (ctx.attempt.status !== AttemptStatus.IN_PROGRESS) {
      return res.status(409).json({ message: "Attempt is not in progress" });
    }

    const languageId = getConfiguredLanguageId();

    const submission = await submitCode({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
    });

    const result = await waitForSubmissionResult(submission.token);

    return res.status(200).json({
      status: result.status.description,
      stdout: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compile_output,
      time: result.time,
      memory: result.memory,
    });
  } catch (error) {
    console.error("Run code failed:", error);
    return res.status(500).json({ message: "Run code failed" });
  }
};

// POST /grading/:attemptId/questions/:questionId/runAllTests
export const runAllTests = async (req: Request, res: Response) => {
  const questionId = Number(req.params.questionId);
  const { sourceCode } = req.body;

  if (!Number.isInteger(questionId) || questionId <= 0) {
    return res.status(400).json({ message: "Invalid question ID" });
  }
  
  if (typeof sourceCode !== "string" || !sourceCode.trim()) {
    return res.status(400).json({ message: "sourceCode required" });
  }

  const ctx = await getAttempt(req, res, questionId);
  if (!ctx) return;

  if (ctx.attempt.status !== AttemptStatus.IN_PROGRESS) {
    return res.status(409).json({ message: "Attempt is not in progress" });
  }

  const testCases = await prisma.testCase.findMany({
    where: {
      questionId: questionId,
      visibility: {
        in: [Visibility.VISIBLE, Visibility.HIDDEN_A]
      }
    }
  });

  if (testCases.length <= 0) {
    return res.status(404).json({ message: "Testcases not found" });
  }

  const languageId = getConfiguredLanguageId();

  const results = [];
  
  for (let testCase of testCases) {
    const { input, visibility } = testCase
    const submission = await submitCode({
      source_code: sourceCode,
      language_id: languageId,
      stdin: input,
    });
  
    const output = await waitForSubmissionResult(submission.token);
    let result = evaluateResult(output, testCase.expectedOutput);
    const visibleinput = visibility === Visibility.VISIBLE ? input : 'HIDDEN'; 
    result.actualOutput = visibility === Visibility.VISIBLE ? result.actualOutput: 'HIDDEN';

    
    if (visibility === Visibility.VISIBLE) {
      results.push({
        visibleinput,
        expectedOutput: testCase.expectedOutput,
        result
      })
    } else {
      results.push({
        visibleinput: 'HIDDEN',
        result: {
          passed: result.passed,
          status: result.status,
          actualOutput: null
        }
      })
    }
  }

  return res.status(200).json({ results });
}

// PUT /grading/:attemptId/questions/:questionId/draft
export const saveDraft = async (req: Request, res: Response) => {
  try {
    const questionId = Number(req.params.questionId);
    const { sourceCode } = req.body;

    if (!Number.isInteger(questionId) || questionId <= 0) {
      return res.status(400).json({ message: "Invalid question ID" });
    }
    if (typeof sourceCode !== "string") {
      return res.status(400).json({ message: "sourceCode must be a string" });
    }

    const ctx = await getAttempt(req, res, questionId);
    if (!ctx) return;

    if (ctx.attempt.status !== AttemptStatus.IN_PROGRESS) {
      return res.status(409).json({ message: "Attempt is not in progress" });
    }

    const existingDraft = await prisma.submission.findFirst({
      where: { attemptId: ctx.attemptId, questionId, isDraft: true },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    });

    const draft = existingDraft
      ? await prisma.submission.update({
          where: { id: existingDraft.id },
          data: { submittedAnswer: sourceCode, submittedAt: new Date() },
        })
      : await prisma.submission.create({
          data: {
            attemptId: ctx.attemptId,
            questionId,
            submittedAnswer: sourceCode,
            isDraft: true,
          },
        });

    return res.status(200).json({
      message: "Draft saved successfully",
      attemptId: ctx.attemptId,
      questionId,
      draftId: draft.id,
      isDraft: draft.isDraft,
      savedAt: draft.submittedAt,
    });
  } catch (error) {
    console.error("Save draft failed:", error);
    return res.status(500).json({ message: "Save draft failed" });
  }
};

// POST /grading/:attemptId/submit
export const submitAttempt = async (req: Request, res: Response) => {
  try {
    const ctx = await getAttempt(req, res);
    if (!ctx) return;
    const { attempt, attemptId, employeeId } = ctx;

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      return res.status(409).json({ message: "Attempt cannot be submitted in its current state" });
    }

    await prisma.$transaction(async (tx) => {
      // Finalize all active drafts for this attempt
      for (const question of attempt.questions) {
        const latestDraft = await tx.submission.findFirst({
          where: { attemptId, questionId: question.questionId, isDraft: true },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        });

        if (latestDraft) {
          await tx.submission.update({
            where: { id: latestDraft.id },
            data: { isDraft: false, submittedAt: new Date() },
          });
        }
      }

      await transitionAttemptInTransaction(tx, {
        attemptId,
        toState: AttemptStatus.SUBMITTED,
        actor: { type: "EMPLOYEE", employeeId },
        metadata: { source: "grading_submit_api" },
      });
    });

    // Run grading asynchronously after transition commits
    void gradeAttempt(attemptId).catch((error: unknown) => {
      console.error("Background grading failed:", error);
    });

    return res.status(202).json({
      message: "Attempt submitted successfully",
      attemptId,
      status: AttemptStatus.SUBMITTED,
      gradingStatus: "PENDING",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "DEADLINE_PASSED") {
      return res.status(409).json({ message: "The submission deadline has passed" });
    }
    if (message.startsWith("INVALID_TRANSITION") || message === "CONCURRENT_TRANSITION") {
      return res.status(409).json({ message: "Attempt cannot be submitted in its current state" });
    }
    console.error("Submit attempt failed:", error);
    return res.status(500).json({ message: "Submit attempt failed" });
  }
};

// GET /grading/:attemptId/report
export const getGradingReport = async (req: Request, res: Response) => {
  try {
    const ctx = await getAttempt(req, res);
    if (!ctx) return;
    const { attempt, attemptId } = ctx;

    if (!attempt.gradingReport) {
      return res.status(404).json({
        message: "Grading report is not available yet",
        attemptId,
        attemptStatus: attempt.status,
      });
    }

    return res.status(200).json({
      attemptId: attempt.id,
      attemptStatus: attempt.status,
      report: attempt.gradingReport,
    });
  } catch (error) {
    console.error("Get grading report failed:", error);
    return res.status(500).json({ message: "Get grading report failed" });
  }
};