import { Attempt } from './attempt.model';

export interface GradingReport {
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalTestCases: number;
  passedTestCases: number;
  score: number | null;
  completedAt: string | null;
  integritySummary: {
    totalEvents: number;
    eventsByType: Record<string, number>;
  } | null;
}

export interface ReviewTestResult {
  testCaseId: number;
  visibility: 'VISIBLE' | 'HIDDEN_A' | 'HIDDEN_B';
  passed: boolean;
  status: string;
  actualOutput: string | null;
}

export interface ReviewSubmission {
  id: number;
  submittedAnswer: string;
  submittedAt: string;
  isCorrect: boolean | null;
  testResults: ReviewTestResult[] | null;
}

export interface GradingReview extends Attempt {
  gradingReport: GradingReport | null;
  questions: {
    questionId: number;
    position: number;
    question: {
      questionContent: string;
      questionType: 'SCRATCH' | 'DEBUG';
    };
    submissions: ReviewSubmission[];
  }[];
}
