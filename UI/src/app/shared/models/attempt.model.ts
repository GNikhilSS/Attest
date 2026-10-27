
export type AttemptStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADED'
  | 'DECIDED';

export type AttemptDecision = 'APPROVED' | 'REJECTED';

export interface Attempt {
  id: number;
  employeeId: number;
  skillId: number;
  proficiencyLevel: number;
  status: AttemptStatus;
  createdAt: string;
  startTime: string | null;
  deadline: string | null;
  approvedById: number | null;
  decision: AttemptDecision | null;
  decisionReason: string | null;

  skill: {
    id: number;
    skillName: string;
  };

  attemptBy?: {
    id: number;
    name: string;
  };
}
