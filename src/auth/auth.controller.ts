//DONE
// - login validates employeeId as a positive integer (400), checks the employee exists (401), and signs an HS256 token with the id.
// - register creates an employee and returns a token.
// - Token expiry and secret come from lib/env.ts.

// NOT DONE
// - login returns the full employee record, including managedById and name, which is more than the client needs. Return only what the client uses.
// - Login messages differ: “Invalid EmpId (format)” and “Invalid EmpId” should be one generic message, per our rule.
// - register returns 401 for a missing name; that should be 400, since it’s a malformed body.
// - register has no input validation beyond presence: an empty or whitespace name passes.
// - register is public and lets anyone create an employee with a token. It should be dev-only or removed before any shared use.
// - register doesn’t check for duplicate names, so repeat calls create repeat employees.
// - JWT is signed with no audience or issuer claims; fine for the POC, but note it for the OAuth change.
// - Dev login still accepts any valid employee id with no credential check; mark it dev-only in code and docs.

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

    res.json({ employee, token });
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

    res.json({ employee, token });
}
