import type { Request, Response } from "express"

import type { AuthedRequest } from "../auth/auth.types.js";

import { prisma } from "../lib/prisma.js";
import { AttemptStatus, type Attempt } from "../../generated/prisma/client.js";

import { transitionAttempt } from "./attemptStateMachine.js";

export const createAttemptRequest = async (req: Request, res: Response) => {
    const employeeId = (req as AuthedRequest).employee.employeeId;
    const { skillId, proficiencyLevel } = req.body;

    const skill = await prisma.skill.findUnique({
        where: {
            id: skillId
        }
    });
    if (!skill) {
        return res.status(404).json({ message: "Skill not found" });
    }

    const attempt = await prisma.attempt.create({
        data: {
            employeeId: employeeId, 
            skillId: skill.id, 
            proficiencyLevel: proficiencyLevel,
            status: AttemptStatus.REQUESTED,
        }
    });

    return res.status(201).json({ attempt });
}

export const getAttemptRequest = async (req: Request, res: Response) => {
    const attemptId = Number(req.params.attemptId);

    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId
        }
    })

    if (!attempt) {
        return res.status(404).json({ message: "Attempt Not Found" });
    }

    return res.status(200).json({ attempt });
}

export const getEmployeeAttemptRequests = async (req: Request, res: Response) => {
    const employeeId = (req as AuthedRequest).employee.employeeId;

    const attempts = await prisma.attempt.findMany({
        where: {
            employeeId
        }
    })

    if (!attempts) {
        return res.status(404).json({ message: "No Attempts found" });
    }
    return res.status(200).json({ attempts });
}

export const getManagerAttemptRequests = async (req: Request, res: Response) => {
    const managerId = (req as AuthedRequest).employee.employeeId;

    const attempts = await prisma.attempt.findMany({
        where: {
            attemptBy: {managedById: managerId} 
        }
    })

    return res.status(200).json({ attempts });
}

export const approveAttemptRequest = async (req: Request, res: Response) => {
    const attemptId = Number(req.params.attemptId);
    const managerId = (req as AuthedRequest).employee.employeeId;

    const attempt = await prisma.attempt.findUnique({
        where: {
            id: attemptId
        },
        include: {
            attemptBy: true
        }
    });

    if (!attempt) {
        return res.status(404).json({ message: "Attempt not found" });
    }

    if (attempt.attemptBy.managedById !== managerId) {
        return res.status(403).json({ message: "Unauth (u aint the manager for this" });
    }

    await transitionAttempt({
        attemptId,
        toState: AttemptStatus.APPROVED,
        actor: { type: "MANAGER", employeeId: managerId}
    })

    const transition = await buildExam(attemptId, attempt.skillId, attempt.proficiencyLevel);

    return res.status(200).json({ transition })
}

export const buildExam = async (attemptId: number, skillId: number, proficiencyLevel: number) => {

    const questions = await prisma.question.findMany({
        where: {
            skillId: skillId,
            proficiencyLevel: proficiencyLevel
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

