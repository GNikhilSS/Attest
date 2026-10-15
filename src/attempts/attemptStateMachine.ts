import {
  AttemptStatus,
  type Prisma,
} from "../../generated/prisma/client.js";
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

    // Validate deadline before preparing the update.
    const validationTime = new Date();

    if (
      actor.type === "EMPLOYEE" &&
      toState === AttemptStatus.SUBMITTED &&
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
      const decision = metadata.decision;

      if (
        decision !== "APPROVED" &&
        decision !== "REJECTED"
      ) {
        throw new Error("INVALID_MANAGER_DECISION");
      }

      if (
        decision === "REJECTED" &&
        (
          typeof metadata.reason !== "string" ||
          !metadata.reason.trim()
        )
      ) {
        throw new Error("REJECTION_REASON_REQUIRED");
      }
    }

    // Recheck immediately before the conditional database update.
    const transitionTime = new Date();

    if (
      actor.type === "EMPLOYEE" &&
      toState === AttemptStatus.SUBMITTED &&
      attempt.deadline <= transitionTime
    ) {
      throw new Error("DEADLINE_PASSED");
    }

    if (
      actor.type === "SERVER" &&
      toState === AttemptStatus.SUBMITTED &&
      attempt.deadline > transitionTime
    ) {
      throw new Error("DEADLINE_NOT_PASSED");
    }

    // Compare-and-set: require the original status to remain unchanged.
    // Include the deadline condition for submission transitions too.
    const deadlineCondition =
      toState === AttemptStatus.SUBMITTED &&
      actor.type === "EMPLOYEE"
        ? { deadline: { gt: transitionTime } }
        : toState === AttemptStatus.SUBMITTED &&
            actor.type === "SERVER"
          ? { deadline: { lte: transitionTime } }
          : {};

    const updated = await tx.attempt.updateMany({
      where: {
        id: attemptId,
        status: fromState,
        ...deadlineCondition,
      },
      data: {
        status: toState,
        ...(toState === AttemptStatus.APPROVED &&
        actor.type === "MANAGER"
          ? { approvedById: actor.employeeId }
          : {}),
        ...(toState === AttemptStatus.IN_PROGRESS
          ? { startTime: transitionTime }
          : {}),
      },
    });

    if (updated.count !== 1) {
      // Distinguish deadline failures from other concurrent changes.
      if (
        toState === AttemptStatus.SUBMITTED &&
        actor.type === "EMPLOYEE" &&
        attempt.deadline <= new Date()
      ) {
        throw new Error("DEADLINE_PASSED");
      }

      if (
        toState === AttemptStatus.SUBMITTED &&
        actor.type === "SERVER" &&
        attempt.deadline > new Date()
      ) {
        throw new Error("DEADLINE_NOT_PASSED");
      }

      throw new Error("CONCURRENT_TRANSITION");
    }

    // The status update and event must commit or roll back together.
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
        } as Prisma.InputJsonValue,
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
