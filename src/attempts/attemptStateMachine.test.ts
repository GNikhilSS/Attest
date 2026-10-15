import { describe, expect, it } from "vitest";
import { AttemptStatus as S } from "../../generated/prisma/client.js";
import {
  canTransition,
  validateTransition,
} from "./attemptStateMachine.js";

const states = Object.values(S);

const actors = [
  "EMPLOYEE",
  "MANAGER",
  "SERVER",
] as const;

describe("attempt state transition rules", () => {
  it("allows the intended transitions for the correct actor", () => {
    const allowedTransitions = [
      [S.REQUESTED, S.APPROVED, "MANAGER"],
      [S.APPROVED, S.CREATED, "SERVER"],
      [S.CREATED, S.IN_PROGRESS, "EMPLOYEE"],
      [S.CREATED, S.SUBMITTED, "SERVER"],
      [S.IN_PROGRESS, S.SUBMITTED, "EMPLOYEE"],
      [S.IN_PROGRESS, S.SUBMITTED, "SERVER"],
      [S.SUBMITTED, S.GRADED, "SERVER"],
      [S.GRADED, S.DECIDED, "MANAGER"],
    ] as const;

    for (const [from, to, actor] of allowedTransitions) {
      expect(canTransition(from, to, actor)).toBe(true);
      expect(() => validateTransition(from, to, actor)).not.toThrow();
    }
  });

  it("checks every state pair against the allowed-transition list", () => {
    const allowedTransitions = [
      [S.REQUESTED, S.APPROVED, "MANAGER"],
      [S.APPROVED, S.CREATED, "SERVER"],
      [S.CREATED, S.IN_PROGRESS, "EMPLOYEE"],
      [S.CREATED, S.SUBMITTED, "SERVER"],
      [S.IN_PROGRESS, S.SUBMITTED, "EMPLOYEE"],
      [S.IN_PROGRESS, S.SUBMITTED, "SERVER"],
      [S.SUBMITTED, S.GRADED, "SERVER"],
      [S.GRADED, S.DECIDED, "MANAGER"],
    ] as const;

    const allowedKeys = new Set(
      allowedTransitions.map(([from, to, actor]) =>
        `${from}:${to}:${actor}`,
      ),
    );

    for (const from of states) {
      for (const to of states) {
        for (const actor of actors) {
          const expected = allowedKeys.has(`${from}:${to}:${actor}`);

          expect(canTransition(from, to, actor)).toBe(expected);

          if (!expected) {
            expect(() =>
              validateTransition(from, to, actor),
            ).toThrow("INVALID_TRANSITION");
          }
        }
      }
    }
  });

  it("does not allow DECIDED to transition to any state", () => {
    for (const to of states) {
      for (const actor of actors) {
        expect(canTransition(S.DECIDED, to, actor)).toBe(false);

        expect(() =>
          validateTransition(S.DECIDED, to, actor),
        ).toThrow("INVALID_TRANSITION");
      }
    }
  });

  it("does not allow transitions back to earlier states", () => {
    const backwardTransitions = [
      [S.APPROVED, S.REQUESTED],
      [S.CREATED, S.APPROVED],
      [S.IN_PROGRESS, S.CREATED],
      [S.SUBMITTED, S.IN_PROGRESS],
      [S.GRADED, S.SUBMITTED],
      [S.DECIDED, S.GRADED],
    ] as const;

    for (const [from, to] of backwardTransitions) {
      for (const actor of actors) {
        expect(canTransition(from, to, actor)).toBe(false);
      }
    }
  });
});
