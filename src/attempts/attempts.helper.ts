import { AttemptStatus, Visibility } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { transitionAttempt } from "./attemptStateMachine.js";

export const isEmployeeAttempt = async (attemptId: number, employeeId: number) => {
    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId,
            employeeId: employeeId
        },
    });
    return attempt;
}

export const buildExam = async (attemptId: number) => {

    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId
        }
    });

    if (!attempt) {
        throw new Error("ATTEMPT_NOT_FOUND")
    }

    const questions = await prisma.question.findMany({
        where: {
            skillId: attempt.skillId,
            proficiencyLevel: attempt.proficiencyLevel
        },
        take: 2
    })

    if (questions.length !== 2) {
        throw new Error("NOT_ENOUGH_QUESTIONS");
    }

    for (const [idx, question] of questions.entries()) {
        await prisma.attemptQuestion.create({
            data: {
                attemptId: attemptId,
                questionId: question.id,
                position: idx + 1
            }
        });
    };

    return await transitionAttempt({
        attemptId,
        toState: AttemptStatus.CREATED,
        actor: { type: "SERVER" }
    });

}

export const getAttemptQuestions = async (attemptId: number) => {
    const attemptQuestions = await prisma.attemptQuestion.findMany({
        where: {
            attemptId: attemptId
        },
        include: {
            question: {
                select: {
                    id: true,
                    questionType: true,
                    questionContent: true,
                    starterCode: true,
                    testCases: {
                        where: {
                            visibility: Visibility.VISIBLE
                        },
                        select: {
                            id: true,
                            input: true,
                            expectedOutput: true
                        },
                        orderBy: {
                            id: "asc"
                        }
                    }
                }
            }
        },
        orderBy: {
            position: "asc"
        }
    })

    return attemptQuestions;
}

export const submitExamAfterDeadline = async (attemptId: number) => {

    const updatedAttempt = await transitionAttempt({
            attemptId: attemptId,
            toState: AttemptStatus.SUBMITTED,
            actor: { type: "SERVER" },
            metadata: { reason: "DEADLINE_EXPIRED" },
        }
    )

    return updatedAttempt;
}