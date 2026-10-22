import {
  AttemptStatus,
  GradingStatus,
  type Prisma,
} from "../../generated/prisma/client.js";

import { prisma } from "../lib/prisma.js";
import {
  submitCode,
  waitForSubmissionResult,
} from "./judge0Client.js";
import { evaluateResult } from "./evaluateResult.js";
import { transitionAttempt } from "../attempts/attemptStateMachine.js";

type StoredTestResult = {
  testCaseId: number;
  visibility: string;
  passed: boolean;
  status: string;
  actualOutput: string | null;
};

type SubmissionGrade = {
  submissionId: number;
  isCorrect: boolean;
  results: StoredTestResult[];
};

export async function gradeAttempt(attemptId: number) {
  const configuredLanguageId = Number(process.env.JUDGE0_LANGUAGE_ID);

  if (
    !Number.isInteger(configuredLanguageId) ||
    configuredLanguageId <= 0
  ) {
    throw new Error("JUDGE0_LANGUAGE_ID is not configured correctly");
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      gradingReport: true,
      questions: {
        include: {
          question: {
            include: {
              testCases: true,
            },
          },
          submissions: {
            where: {
              isDraft: false,
            },
            orderBy: [
              { submittedAt: "desc" },
              { id: "desc" },
            ],
          },
        },
      },
    },
  });

  if (!attempt) {
    throw new Error("ATTEMPT_NOT_FOUND");
  }

  // Already graded: return the existing report.
  if (
    attempt.status === AttemptStatus.GRADED ||
    attempt.status === AttemptStatus.DECIDED
  ) {
    return attempt.gradingReport;
  }

  if (attempt.status !== AttemptStatus.SUBMITTED) {
    throw new Error("ATTEMPT_NOT_SUBMITTED");
  }

  // Recover when grading completed but the state transition failed.
  if (attempt.gradingReport?.status === GradingStatus.COMPLETED) {
    await transitionAttempt({
      attemptId,
      toState: AttemptStatus.GRADED,
      actor: { type: "SERVER" },
      metadata: { source: "gradingWorker" },
    });

    return prisma.gradingReport.findUnique({
      where: { attemptId },
    });
  }

  // Mark the report as RUNNING while grading is in progress.
  await prisma.gradingReport.upsert({
    where: { attemptId },
    create: {
      attemptId,
      status: GradingStatus.RUNNING,
      totalTestCases: 0,
      passedTestCases: 0,
    },
    update: {
      status: GradingStatus.RUNNING,
      totalTestCases: 0,
      passedTestCases: 0,
      score: null,
      completedAt: null,
    },
  });

  let totalTestCases = 0;
  let passedTestCases = 0;
  let score: number | null = null;

  try {
    const grades: SubmissionGrade[] = [];

    for (const attemptQuestion of attempt.questions) {
      const question = attemptQuestion.question;
      const testCases = question.testCases;

      // Submissions are sorted newest first.
      // Only the latest non-draft submission for this question is graded.
      const latestSubmission = attemptQuestion.submissions[0];

      if (!latestSubmission) {
        // Unanswered questions receive no passing test cases.
        totalTestCases += testCases.length;
        continue;
      }

      const results: StoredTestResult[] = [];

      for (const testCase of testCases) {
        const judgeSubmission = await submitCode({
          source_code: latestSubmission.submittedAnswer,
          language_id: configuredLanguageId,
          stdin: testCase.input,
        });

        const executionResult = await waitForSubmissionResult(
          judgeSubmission.token,
        );

        const evaluated = evaluateResult(
          executionResult,
          testCase.expectedOutput,
        );

        results.push({
          testCaseId: testCase.id,
          visibility: testCase.visibility,
          passed: evaluated.passed,
          status: evaluated.status,

          // Do not store actual output for hidden test cases.
          actualOutput:
            testCase.visibility === "VISIBLE"
              ? evaluated.actualOutput
              : null,
        });

        totalTestCases++;

        if (evaluated.passed) {
          passedTestCases++;
        }
      }

      grades.push({
        submissionId: latestSubmission.id,
        isCorrect:
          testCases.length > 0 &&
          results.length === testCases.length &&
          results.every((result) => result.passed),
        results,
      });
    }

    score =
      totalTestCases > 0
        ? Math.round((passedTestCases / totalTestCases) * 100)
        : null;

    // Save all grading results and complete the report atomically.
    await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        await tx.submission.update({
          where: { id: grade.submissionId },
          data: {
            isCorrect: grade.isCorrect,
            gradingStatus: GradingStatus.COMPLETED,
            testResults:
              grade.results as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await tx.gradingReport.update({
        where: { attemptId },
        data: {
          status: GradingStatus.COMPLETED,
          totalTestCases,
          passedTestCases,
          score,
          completedAt: new Date(),
        },
      });
    });
  } catch (error) {
    // Preserve the original grading or persistence error if recording
    // the FAILED status also encounters a database error.
    try {
      await prisma.gradingReport.update({
        where: { attemptId },
        data: {
          status: GradingStatus.FAILED,
        },
      });
    } catch (reportUpdateError) {
      // Log both errors so the original failure is not lost.
      console.error(
        "Failed to mark grading report as FAILED:",
        reportUpdateError,
      );
      console.error("Original grading error:", error);
    }

    throw error;
  }

  // Transition only after successful grading persistence.
  // Intentionally outside the grading try/catch.
  await transitionAttempt({
    attemptId,
    toState: AttemptStatus.GRADED,
    actor: { type: "SERVER" },
    metadata: {
      source: "gradingWorker",
      totalTestCases,
      passedTestCases,
      score,
    },
  });

  return prisma.gradingReport.findUnique({
    where: { attemptId },
  });
}
