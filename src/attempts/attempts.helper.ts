import { AttemptStatus, Visibility } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { transitionAttempt } from "./attemptStateMachine.js";
import { generateAndSaveAssessment } from "../assessment/assessmentBankService.js";

export const isEmployeeAttempt = async (attemptId: number, employeeId: number) => {
    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId,
            employeeId: employeeId
        },
    });
    return attempt;
}

export const isManagerAttempt = async (attemptId: number, managerId: number) => {
    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId,
        },
        include: {
            approvedBy: {
                select: {
                    name: true
                },
                where: {
                    id: managerId
                }
            }
        }
    })
    return attempt;
}

export const buildExam = async (attemptId: number) => {
    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId
        },
        include: {
            skill: true
        }
    });

    if (!attempt) {
        throw new Error("ATTEMPT_NOT_FOUND");
    }

    let questions = await prisma.question.findMany({
        where: {
            skillId: attempt.skillId,
            proficiencyLevel: attempt.proficiencyLevel
        },
        take: 2
    });

    // Automatic check-and-generate: if question bank has fewer than 2 questions, generate on the fly
    if (questions.length < 2 && attempt.skill) {
        try {
            console.log(
                `[buildExam] Not enough questions in bank for ${attempt.skill.skillName} (Level ${attempt.proficiencyLevel}). Auto-generating via Gemini...`
            );
            await generateAndSaveAssessment(
                {
                    language: attempt.skill.skillName,
                    proficiencyLevel: attempt.proficiencyLevel,
                },
                {
                    skillId: attempt.skillId,
                }
            );

            // Re-fetch questions after generation
            questions = await prisma.question.findMany({
                where: {
                    skillId: attempt.skillId,
                    proficiencyLevel: attempt.proficiencyLevel,
                },
                take: 2,
            });
        } catch (genError: any) {
            console.error(
                `[buildExam] Automatic question generation failed: ${genError?.message}`
            );
        }
    }

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
    }

    return await transitionAttempt({
        attemptId,
        toState: AttemptStatus.CREATED,
        actor: { type: "SERVER" }
    });
};

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
                    skill: {
                        select: {
                            id: true,
                            skillName: true
                        }
                    },
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
    });

    return attemptQuestions;
};

export const submitExamAfterDeadline = async (attemptId: number) => {
    const updatedAttempt = await transitionAttempt({
        attemptId: attemptId,
        toState: AttemptStatus.SUBMITTED,
        actor: { type: "SERVER" },
        metadata: { reason: "DEADLINE_EXPIRED" },
    });

    return updatedAttempt;
};
