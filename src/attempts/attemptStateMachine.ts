// DONE
// - Transition table covers the full lifecycle, including the server expiry paths.
// - Each transition checks the rule, the actor, and the deadline before writing.
// - Writes are compare-and-set, so a stale or concurrent change fails instead of overwriting.
// - Status change and event row commit in the same transaction.
// - Decisions take explicit inputs and write decision and decisionReason columns.
// - transitionAttemptInTransaction lets callers join their own transaction.
// - CREATED sets the deadline from the shared exam window constant.

// NOT DONE
// - metadata is still a caller-supplied parameter; remove it or let the function build it.
// - Manager-side checks run twice: in the controller and in validateActor. Keep it in one place.
// - Error messages are plain strings; typed error classes would make mapping safer.
// - Deadline is checked on the app clock in validateDeadline and on the database clock in the SQL path; the two can disagree slightly.
// - Deadline is checked before the write and again on failure, so the message depends on which check fires first.
// - DEADLINE_NOT_PASSED is an internal message; make sure it never reaches a candidate.
// - No retry path for a transition that fails after its caller already did other writes outside the transaction.
// - Event type for automatic submission is NOT_STARTED only when created to submitted; the expiry from in_progress records STATE_TRANSITION. Decide if that should differ.
// - Decision on REJECTED stores a trimmed reason but the audit payload does not record the decision itself.

import {
  AttemptStatus,
  Decision,
  Prisma,
  type Prisma as PrismaTypes,
} from "../../generated/prisma/client.js";
import { EXAM_WINDOW_MS } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";

// Types
type ActorType = "EMPLOYEE" | "MANAGER" | "SERVER";

type EmployeeActor = {
  type: "EMPLOYEE";
  employeeId: number;
};

type ManagerActor = {
  type: "MANAGER";
  employeeId: number;
};

type ServerActor = {
  type: "SERVER";
};

type Actor = EmployeeActor | ManagerActor | ServerActor;

type TransitionRule = {
  from: AttemptStatus;
  to: AttemptStatus;
  actor: ActorType;
};

type TransitionInput = {
  attemptId: number;
  toState: AttemptStatus;
  actor: Actor;
  decision?: Decision;
  decisionReason?: string;
  metadata?: Record<string, unknown>;
};

type TransactionClient = PrismaTypes.TransactionClient;
// Allowed state transitions
const transitionRules: TransitionRule[] = [
  {
    from: AttemptStatus.REQUESTED,
    to: AttemptStatus.APPROVED,
    actor: "MANAGER",
  },
  {
    from: AttemptStatus.APPROVED,
    to: AttemptStatus.CREATED,
    actor: "SERVER",
  },
  {
    from: AttemptStatus.CREATED,
    to: AttemptStatus.IN_PROGRESS,
    actor: "EMPLOYEE",
  },
  {
    from: AttemptStatus.CREATED,
    to: AttemptStatus.SUBMITTED,
    actor: "SERVER",
  },
  {
    from: AttemptStatus.IN_PROGRESS,
    to: AttemptStatus.SUBMITTED,
    actor: "EMPLOYEE",
  },
  {
    from: AttemptStatus.IN_PROGRESS,
    to: AttemptStatus.SUBMITTED,
    actor: "SERVER",
  },
  {
    from: AttemptStatus.SUBMITTED,
    to: AttemptStatus.GRADED,
    actor: "SERVER",
  },
  {
    from: AttemptStatus.GRADED,
    to: AttemptStatus.DECIDED,
    actor: "MANAGER",
  },
];

// Transition validation
export function validateTransition(
  from: AttemptStatus,
  to: AttemptStatus,
  actor: ActorType,
): void {
  const check = transitionRules.some(
    (rule) =>
      rule.from === from &&
      rule.to === to &&
      rule.actor === actor,
  );

  if (!check) {
    throw new Error(
      `INVALID_TRANSITION: ${from} -> ${to} by ${actor}`,
    );
  }
  return;
}

function validateActor(
  actor: Actor,
  attempt: {
    employeeId: number;
    attemptBy: {
      managedById: number | null;
    };
  },
): void {
  if (
    actor.type === "EMPLOYEE" &&
    actor.employeeId !== attempt.employeeId
  ) {
    throw new Error("FORBIDDEN");
  }

  if (
    actor.type === "MANAGER" &&
    attempt.attemptBy.managedById !== actor.employeeId
  ) {
    throw new Error("FORBIDDEN");
  }
}

function isEmployeeDeadlineTransition(
  actor: Actor,
  toState: AttemptStatus,
): boolean {
  return (
    actor.type === "EMPLOYEE" &&
    (
      toState === AttemptStatus.IN_PROGRESS ||
      toState === AttemptStatus.SUBMITTED
    )
  );
}

function validateDeadline(
  actor: Actor,
  toState: AttemptStatus,
  deadline: Date | null,
): void {
  const now = new Date();

  if (
    isEmployeeDeadlineTransition(actor, toState) &&
    deadline !== null &&
    deadline <= now
  ) {
    throw new Error("DEADLINE_PASSED");
  }

  if (
    actor.type === "SERVER" &&
    toState === AttemptStatus.SUBMITTED &&
    deadline !== null &&
    deadline > now
  ) {
    throw new Error("DEADLINE_NOT_PASSED");
  }
}

function validateDecision(
  toState: AttemptStatus,
  decision?: Decision,
  decisionReason?: string,
): void {
  if (toState !== AttemptStatus.DECIDED) {
    return;
  }

  if (
    decision !== Decision.APPROVED &&
    decision !== Decision.REJECTED
  ) {
    throw new Error("INVALID_MANAGER_DECISION");
  }

  if (
    decision === Decision.REJECTED &&
    !decisionReason?.trim()
  ) {
    throw new Error("REJECTION_REASON_REQUIRED");
  }
}

// Database update helpers
function buildUpdateData(
  toState: AttemptStatus,
  actor: Actor,
  decision: Decision | undefined,
  decisionReason: string | undefined,
  transitionTime: Date,
): PrismaTypes.AttemptUpdateManyMutationInput {
  return {
    status: toState,

    ...(toState === AttemptStatus.APPROVED &&
    actor.type === "MANAGER"
      ? { approvedById: actor.employeeId }
      : {}),

    ...(toState === AttemptStatus.CREATED
      ? {
          deadline: new Date(
            transitionTime.getTime() + EXAM_WINDOW_MS,
          ),
        }
      : {}),

    ...(toState === AttemptStatus.IN_PROGRESS
      ? { startTime: transitionTime }
      : {}),

    ...(toState === AttemptStatus.DECIDED
      ? {
          ...(decision !== undefined ? { decision } : {}),
          decisionReason:
            decision === Decision.REJECTED
              ? decisionReason!.trim()
              : null,
        }
      : {}),
  };
}

function isAutomaticSubmission(
  fromState: AttemptStatus,
  toState: AttemptStatus,
): boolean {
  return (
    fromState === AttemptStatus.CREATED &&
    toState === AttemptStatus.SUBMITTED
  );
}

// Main transition function
export async function transitionAttemptInTransaction(
  tx: TransactionClient,
  {
    attemptId,
    toState,
    actor,
    decision,
    decisionReason,
    metadata = {},
  }: TransitionInput,
) {
  // 1. Load the attempt and its manager relationship.
  const attempt = await tx.attempt.findUnique({
    where: { id: attemptId },
    include: {
      attemptBy: {
        select: {
          id: true,
          managedById: true,
        },
      },
    },
  });

  if (!attempt) {
    throw new Error("ATTEMPT_NOT_FOUND");
  }

  const fromState = attempt.status;

  // 2. Validate the requested transition and actor.
  validateTransition(fromState, toState, actor.type);
  validateActor(actor, attempt);

  // 3. Validate deadline and decision requirements.
  validateDeadline(actor, toState, attempt.deadline);
  validateDecision(toState, decision, decisionReason);

  const transitionTime = new Date();

  // 4. Prepare fields that need updating for this transition.
  const data = buildUpdateData(
    toState,
    actor,
    decision,
    decisionReason,
    transitionTime,
  );

  // 5. Perform a conditional update to prevent stale state changes.
  let updatedCount: number;

  if (isEmployeeDeadlineTransition(actor, toState)) {
    updatedCount = await tx.$executeRaw`
      UPDATE "Attempt"
      SET
        "status" = ${toState}::"AttemptStatus"
        ${
          toState === AttemptStatus.IN_PROGRESS
            ? Prisma.sql`, "startTime" = ${transitionTime}`
            : Prisma.empty
        }
      WHERE
        "id" = ${attemptId}
        AND "status" = ${fromState}::"AttemptStatus"
        AND "deadline" > statement_timestamp()
    `;
  } else if (
    actor.type === "SERVER" &&
    toState === AttemptStatus.SUBMITTED
  ) {
    updatedCount = await tx.$executeRaw`
      UPDATE "Attempt"
      SET "status" = ${toState}::"AttemptStatus"
      WHERE
        "id" = ${attemptId}
        AND "status" = ${fromState}::"AttemptStatus"
        AND "deadline" <= statement_timestamp()
    `;
  } else {
    const updated = await tx.attempt.updateMany({
      where: {
        id: attemptId,
        status: fromState,
      },
      data,
    });

    updatedCount = updated.count;
  }

  // 6. Explain why a conditional update did not succeed.
  if (updatedCount !== 1) {
    const currentAttempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      select: {
        status: true,
        deadline: true,
      },
    });

    if (!currentAttempt) {
      throw new Error("ATTEMPT_NOT_FOUND");
    }

    const databaseTime = await tx.$queryRaw<
      Array<{ now: Date }>
    >`
      SELECT statement_timestamp() AS now
    `;

    const now = databaseTime[0]?.now ?? new Date();

    if (
      isEmployeeDeadlineTransition(actor, toState) &&
      currentAttempt.deadline !== null &&
      currentAttempt.deadline <= now
    ) {
      throw new Error("DEADLINE_PASSED");
    }

    if (
      actor.type === "SERVER" &&
      toState === AttemptStatus.SUBMITTED &&
      currentAttempt.deadline !== null &&
      currentAttempt.deadline > now
    ) {
      throw new Error("DEADLINE_NOT_PASSED");
    }

    throw new Error("CONCURRENT_TRANSITION");
  }

  // 7. Record the state change in the same transaction.
  await tx.attemptEvent.create({
    data: {
      attemptId,
      type: isAutomaticSubmission(fromState, toState)
        ? "NOT_STARTED"
        : "STATE_TRANSITION",
      serverTime: transitionTime,
      payload: {
        from: fromState,
        to: toState,
        actorType: actor.type,
        actorId:
          actor.type === "SERVER" ? null : actor.employeeId,
        metadata,
      } as PrismaTypes.InputJsonValue,
    },
  });

  // 8. Return a summary of the successful transition.
  return {
    attemptId,
    fromState,
    toState,
    transitionedAt: transitionTime,
  };
}

// Preserve the existing public function and its behavior.
export async function transitionAttempt(input: TransitionInput) {
  return prisma.$transaction(async (tx) => {
    return transitionAttemptInTransaction(tx, input);
  });
}