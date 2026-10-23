import type { Request, Response } from "express"  

import type { AuthedRequest } from "../auth/auth.types.js";

import { prisma } from "../lib/prisma.js";
import { AttemptStatus } from "../../generated/prisma/client.js";

import { transitionAttempt, transitionAttemptInTransaction } from "./attemptStateMachine.js";
import { buildExam, getAttemptQuestions, isEmployeeAttempt } from "./attempts.helper.js";
import { gradeAttempt } from "../grading/gradingWorker.js";

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
    try {
        const attemptId = Number(req.params.attemptId);
        const managerId = (req as AuthedRequest).employee.employeeId;

        if (!Number.isInteger(attemptId) || attemptId <= 0) {
            return res.status(400).json({ message: "Invalid attempt ID" });
        }

        await transitionAttempt({
            attemptId,
            toState: AttemptStatus.APPROVED,
            actor: { type: "MANAGER", employeeId: managerId}
        });

        const transition = await buildExam(attemptId);

        return res.status(200).json({ transition });
    } catch (error: any) {
        const msg = error?.message || "";
        if (msg === "ATTEMPT_NOT_FOUND") {
            return res.status(404).json({ message: "Attempt not found" });
        }
        if (msg === "UNAUTHORIZED_MANAGER") {
            return res.status(403).json({ message: "You are not the manager for this employee" });
        }
        if (msg.startsWith("INVALID_TRANSITION")) {
            return res.status(409).json({ message: "Attempt cannot be approved in its current state" });
        }
        console.error("Approve attempt error:", error);
        return res.status(500).json({ message: msg || "Failed to approve attempt" });
    }
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

export const recordAttemptEvent = async (req: Request, res: Response) => {
    const attemptId = Number(req.params.attemptId);
    const employeeId = (req as AuthedRequest).employee.employeeId;
    const { type, payload } = req.body;

    if (!Number.isInteger(attemptId) || attemptId <= 0) {
        return res.status(400).json({ message: "Invalid attempt ID" });
    }

    if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ message: "Event type is required" });
    }

    const attempt = await isEmployeeAttempt(attemptId, employeeId);
    if (!attempt) {
        return res.status(403).json({ message: "Forbidden" });
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        return res.status(409).json({ message: "Cannot log events: exam is not in progress" });
    }

    const event = await prisma.attemptEvent.create({
        data: {
            attemptId,
            type: type.trim().toUpperCase(),
            payload: (payload && typeof payload === "object") ? payload : {},
            serverTime: new Date(),
        },
    });

    return res.status(201).json({ event });
}

export const expireOverdueAttempts = async (_req: Request, res: Response) => {
    const now = new Date();
    const overdueAttempts = await prisma.attempt.findMany({
        where: {
            status: { in: [AttemptStatus.CREATED, AttemptStatus.IN_PROGRESS] },
            deadline: { lte: now },
        },
        include: {
            questions: { select: { questionId: true } },
        },
    });

    const expiredIds: number[] = [];

    for (const attempt of overdueAttempts) {
        try {
            await prisma.$transaction(async (tx) => {
                for (const q of attempt.questions) {
                    const draft = await tx.submission.findFirst({
                        where: { attemptId: attempt.id, questionId: q.questionId, isDraft: true },
                        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
                    });
                    if (draft) {
                        await tx.submission.update({
                            where: { id: draft.id },
                            data: { isDraft: false, submittedAt: now },
                        });
                    }
                }

                await transitionAttemptInTransaction(tx, {
                    attemptId: attempt.id,
                    toState: AttemptStatus.SUBMITTED,
                    actor: { type: "SERVER" },
                    metadata: { reason: "DEADLINE_EXPIRED" },
                });
            });

            void gradeAttempt(attempt.id).catch((err: unknown) => {
                console.error(`Auto-grading failed for attempt ${attempt.id}:`, err);
            });

            expiredIds.push(attempt.id);
        } catch (err) {
            console.error(`Failed to expire attempt ${attempt.id}:`, err);
        }
    }

    return res.status(200).json({ expiredCount: expiredIds.length, expiredAttemptIds: expiredIds });
};