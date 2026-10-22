import type { Request, Response } from "express"

import type { AuthedRequest } from "../auth/auth.types.js";

import { prisma } from "../lib/prisma.js";
import { AttemptStatus } from "../../generated/prisma/client.js";

import { transitionAttempt } from "./attemptStateMachine.js";
import { buildExam, getAttemptQuestions, isEmployeeAttempt } from "./attempts.helper.js";

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
    const employeeId = (req as AuthedRequest).employee.employeeId;

    const attempt = await isEmployeeAttempt(attemptId, employeeId);
    if (!attempt) {
        return res.status(403).json({ message: "Forbidden" });
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

    await transitionAttempt({
        attemptId,
        toState: AttemptStatus.APPROVED,
        actor: { type: "MANAGER", employeeId: managerId}
    })

    const transition = await buildExam(attemptId);

    return res.status(200).json({ transition })
}

export const startAttemptExam    = async (req: Request, res: Response) => {
    const attemptId = Number(req.params.attemptId);
    const employeeId = (req as AuthedRequest).employee.employeeId;

    const attempt = await isEmployeeAttempt(attemptId, employeeId);
    if (!attempt) {
        return res.status(403).json({ message: "Forbidden" });
    }

    await transitionAttempt({
        attemptId,
        toState: AttemptStatus.IN_PROGRESS,
        actor: { type: "EMPLOYEE", employeeId }
    })
    
    const attemptQuestions = await getAttemptQuestions(attemptId);

    return res.status(200).json({ attemptQuestions });
}

export const viewAttemptExam = async (req: Request, res: Response) => {
    const attemptId = Number(req.params.attemptId);
    const employeeId = (req as AuthedRequest).employee.employeeId;

    const attempt = await isEmployeeAttempt(attemptId, employeeId);
    if (!attempt) {
        return res.status(403).json({ message: "Forbidden" });
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        return res.status(409).json({ message: "Exam not in progress" })
    };

    if (!attempt.deadline || attempt.deadline <= new Date()) {
        return res.status(409).json({ message: "Exam has ended" });
    }

    const attemptQuestions = await getAttemptQuestions(attemptId);

    return res.status(200).json({ attemptQuestions });
}