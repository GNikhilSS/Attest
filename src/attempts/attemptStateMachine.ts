import {
  AttemptStatus,
  Decision,
  Prisma,
  type Prisma as PrismaTypes,
} from "../../generated/prisma/client.js";
import { EXAM_WINDOW_MS } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";

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

export function canTransition(
  from: AttemptStatus,
  to: AttemptStatus,
  actor: ActorType,
): boolean {
  return transitionRules.some(
    (rule) =>
      rule.from === from &&
      rule.to === to &&
      rule.actor === actor,
  );
}

export function validateTransition(
  from: AttemptStatus,
  to: AttemptStatus,
  actor: ActorType,
): void {
  if (!canTransition(from, to, actor)) {
    throw new Error(
      `INVALID_TRANSITION: ${from} -> ${to} by ${actor}`,
    );
  }
}

export async function transitionAttempt({
  attemptId,
  toState,
  actor,
  decision,
  decisionReason,
  metadata = {},
}: TransitionInput) {
  return prisma.$transaction(async (tx) => {
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

    validateTransition(fromState, toState, actor.type);

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

    // Provide clear application-level deadline errors.
    // The conditional SQL update below independently checks the
    // deadline using PostgreSQL statement_timestamp().
    const validationTime = new Date();

    if (
      actor.type === "EMPLOYEE" &&
      (
        toState === AttemptStatus.IN_PROGRESS ||
        toState === AttemptStatus.SUBMITTED
      ) &&
      attempt.deadline <= validationTime
    ) {
      throw new Error("DEADLINE_PASSED");
    }

    if (
      actor.type === "SERVER" &&
      toState === AttemptStatus.SUBMITTED &&
      attempt.deadline > validationTime
    ) {
      throw new Error("DEADLINE_NOT_PASSED");
    }

    // Manager decisions must include a valid outcome.
    if (toState === AttemptStatus.DECIDED) {
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

    const transitionTime = new Date();

    const data: PrismaTypes.AttemptUpdateManyMutationInput = {
      status: toState,

      ...(toState === AttemptStatus.APPROVED &&
      actor.type === "MANAGER"
        ? { approvedById: actor.employeeId }
        : {}),

      ...(toState === AttemptStatus.IN_PROGRESS
        ? { startTime: transitionTime }
        : {}),

      ...(toState === AttemptStatus.DECIDED
        ? {
            decision,
            decisionReason:
              decision === Decision.REJECTED
                ? decisionReason!.trim()
                : null,
          }
        : {}),

      ...(toState === AttemptStatus.CREATED
        ? { deadline: new Date(transitionTime.getTime() + EXAM_WINDOW_MS) }
        : {})
    };

    // Compare-and-set: the database update only succeeds if the
    // attempt still has its original status.
    let updatedCount: number;

    if (
      actor.type === "EMPLOYEE" &&
      (
        toState === AttemptStatus.IN_PROGRESS ||
        toState === AttemptStatus.SUBMITTED
      )
    ) {
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

      const databaseTime = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT statement_timestamp() AS now
      `;

      const now = databaseTime[0]?.now ?? new Date();

      if (
        actor.type === "EMPLOYEE" &&
        (
          toState === AttemptStatus.IN_PROGRESS ||
          toState === AttemptStatus.SUBMITTED
        ) &&
        currentAttempt.deadline <= now
      ) {
        throw new Error("DEADLINE_PASSED");
      }

      if (
        actor.type === "SERVER" &&
        toState === AttemptStatus.SUBMITTED &&
        currentAttempt.deadline > now
      ) {
        throw new Error("DEADLINE_NOT_PASSED");
      }

      throw new Error("CONCURRENT_TRANSITION");
    }

    // The state update and event creation remain in one transaction.
    await tx.attemptEvent.create({
      data: {
        attemptId,
        type:
          fromState === AttemptStatus.CREATED &&
          toState === AttemptStatus.SUBMITTED
            ? "NOT_STARTED"
            : "STATE_TRANSITION",
        serverTime: transitionTime,
        payload: {
          from: fromState,
          to: toState,
          actorType: actor.type,
          actorId:
            actor.type === "SERVER"
              ? null
              : actor.employeeId,
          metadata,
        } as PrismaTypes.InputJsonValue,
      },
    });

    return {
      attemptId,
      fromState,
      toState,
      transitionedAt: transitionTime,
    };
  });
}
