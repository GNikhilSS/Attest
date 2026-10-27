export interface AttemptQuestion {
  attemptId: number;
  questionId: number;
  position: number;
  question: {
    id: number;
    questionType: 'SCRATCH' | 'DEBUG';
    questionContent: string;
    starterCode: string | null;
    testCases: {
      id: number;
      input: string;
      expectedOutput: string;
    }[];
  };
}