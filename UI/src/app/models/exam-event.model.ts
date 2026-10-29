export type ExamEventType =
  | 'EXAM_STARTED'
  | 'QUESTION_VIEWED'
  | 'QUESTION_CHANGED'
  | 'CODE_RUN'
  | 'CUSTOM_INPUT_RUN'
  | 'DRAFT_SAVED'
  | 'EXAM_SUBMITTED'
  | 'EXAM_TIME_EXPIRED'
  | 'TAB_HIDDEN'
  | 'TAB_VISIBLE'
  | 'CODE_EDITED'
  | 'FULLSCREEN_ENTERED'
  | 'FULLSCREEN_EXITED';

export interface ExamEvent {
  attemptId: number;
  eventType: ExamEventType;
  timestamp: string;
  questionId?: number;
  metadata?: Record<string, unknown>;
}