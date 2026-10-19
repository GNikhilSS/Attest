import type { Request, Response } from 'express';
import jwt  from 'jsonwebtoken';
import { prisma } from "../lib/prisma.js";
import { JWT_EXPIRY, JWT_SECRET } from '../lib/env.js';



export const login = async (req: Request, res: Response) => {
    const employeeId = Number(req.body?.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
        return res.status(400).json({ message: "Invalid EmpId (format)" })
    }

    const employee = await prisma.employee.findUnique({where: { id: employeeId }});
    if (!employee) {
        return res.status(401).json({ message: 'Invalid EmpId' });
    };

    const token = jwt.sign(
        { employeeId: employee.id }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: JWT_EXPIRY}
    )

    res.json({ token });
}

export const register = async (req: Request, res: Response) => {
    const employeeName = req.body?.employeeName;
    if (!employeeName) {
        return res.status(401).json({ message: 'Invalid Name (format)'})
    }

    const employee = await prisma.employee.create({ data: { name: employeeName } });

    const token = jwt.sign(
        { employeeId: employee.id }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: JWT_EXPIRY}
    )

    res.json({ token });
}
