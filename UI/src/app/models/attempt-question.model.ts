export interface AttemptQuestion {
  attemptId: number;
  questionId: number;
  position: number;
  question: {
    id: number;
    questionType: 'SCRATCH' | 'DEBUG';
    questionContent: string;
    starterCode: string | null;
    skill?: {
      id: number;
      skillName: string;
    };
    testCases: {
      id: number;
      input: string;
      expectedOutput: string;
    }[];
  };
}

export interface AttemptQuestionWithTime {
  startTime: string | null;
  skillName?: string;
  attemptQuestions: AttemptQuestion[];
}
