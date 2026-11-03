import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// 1. Get all employees with their current manager and report count
export const getAllEmployees = async (_req: Request, res: Response) => {
    const employees = await prisma.employee.findMany({
        select: {
            id: true,
            name: true,
            role: true,
            managedById: true,
            manager: {
                select: { id: true, name: true }
            },
            _count: {
                select: { reports: true }
            }
        },
        orderBy: { id: 'asc' }
    });

    return res.status(200).json({ employees });
};

// 2. Assign / reassign an employee to a manager
export const assignManager = async (req: Request, res: Response) => {
    const employeeId = Number(req.params.employeeId);
    const { managerId } = req.body; // Pass a number, or null to remove manager

    if (managerId !== null && managerId !== undefined) {
        const parsedManagerId = Number(managerId);

        // Cannot manage oneself
        if (parsedManagerId === employeeId) {
            return res.status(400).json({ message: "An employee cannot be their own manager" });
        }

        // Verify the manager exists
        const managerExists = await prisma.employee.findUnique({
            where: { id: parsedManagerId }
        });
        if (!managerExists) {
            return res.status(404).json({ message: "Manager not found" });
        }
    }

    const updatedEmployee = await prisma.employee.update({
        where: { id: employeeId },
        data: {
            managedById: (managerId !== null && managerId !== undefined) ? Number(managerId) : null
        },
        include: {
            manager: {
                select: { id: true, name: true }
            }
        }
    });

    return res.status(200).json({ employee: updatedEmployee });
};