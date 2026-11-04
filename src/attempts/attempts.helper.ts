import { AttemptStatus, Visibility, QuestionType } from "../../generated/prisma/enums.js";
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

// One question per type in the exam mix. Order matters: it becomes the position.
const EXAM_TYPES: QuestionType[] = [QuestionType.DEBUG, QuestionType.SCRATCH, QuestionType.MCQ];

function pickOnePerType(bank: { id: number; questionType: QuestionType }[]) {
    const chosen: { id: number; questionType: QuestionType }[] = [];
    for (const type of EXAM_TYPES) {
        const candidates = bank.filter((q) => q.questionType === type);
        if (candidates.length === 0) {
            return null;
        }
        const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
        chosen.push(pick);
    }
    return chosen;
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

    const loadBank = () =>
        prisma.question.findMany({
            where: {
                skillId: attempt.skillId,
                proficiencyLevel: attempt.proficiencyLevel
            },
            select: { id: true, questionType: true }
        });

    let chosen = pickOnePerType(await loadBank());

    // Automatic check-and-generate: if any type is missing, generate once and re-check
    if (!chosen && attempt.skill) {
        try {
            console.log(
                `[buildExam] Missing question types for ${attempt.skill.skillName} (Level ${attempt.proficiencyLevel}). Auto-generating via Gemini...`
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

            chosen = pickOnePerType(await loadBank());
        } catch (genError: any) {
            console.error(
                `[buildExam] Automatic question generation failed: ${genError?.message}`
            );
        }
    }

    if (!chosen) {
        throw new Error("NOT_ENOUGH_QUESTIONS");
    }

    for (const [idx, question] of chosen.entries()) {
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