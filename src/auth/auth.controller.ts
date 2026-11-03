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
import { ACCESS_TOKEN_EXPIRY, JWT_SECRET, PASS_SALT, REFRESH_TOKEN_EXPIRY } from '../lib/env.js';
import type { TokenPayload } from './auth.types.js';
import bcrypt from 'bcryptjs';

export const refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) {
        return res.status(401).send('No refresh token')
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (
        typeof decoded !== 'object' ||
        typeof decoded === null ||
        typeof (decoded as TokenPayload).employeeId !== "number"
    ) {
        return res.status(401).json({ message: "jwt decoded err" });
    }

    const employee = await prisma.employee.findUnique({where: { id: decoded.employeeId }});
    if (!employee) {
        return res.status(401).json({ message: 'Invalid EmpId' });
    };

    const accessToken = jwt.sign(
        { employeeId: decoded.employeeId },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    return res
      .header('Authorization', `Bearer ${accessToken}`)
      .status(204)
      .send();
}

export const login = async (req: Request, res: Response) => {
    const employeeId = Number(req.body.employeeId);
    const password = req.body.password;

    // Fetch employee along with their report count
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
            _count: {
                select: { reports: true }
            }
        }
    });
    if (!employee) {
        return res.status(401).json({ message: 'Invalid Creds' });
    };

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Incorrect Password' });
    }

    const hasReports = (employee._count?.reports ?? 0) > 0;

    const token = jwt.sign(
        { employeeId: employee.id, role: employee.role }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: ACCESS_TOKEN_EXPIRY}
    )

    const refreshToken = jwt.sign(
        { employeeId: employee.id, role: employee.role }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: REFRESH_TOKEN_EXPIRY}
    )


    return res
      .cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict' })
      .header('Authorization', `Bearer ${token}`)
      .json({ employeeId: employee.id, name: employee.name, role: employee.role, hasReports 
      });
};

export const register = async (req: Request, res: Response) => {
    const { employeeName, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, PASS_SALT)

    const employee = await prisma.employee.create({ data: { name: employeeName, password: hashedPassword } });

    const token = jwt.sign(
        { employeeId: employee.id, role: employee.role }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: ACCESS_TOKEN_EXPIRY}
    )

    const refreshToken = jwt.sign(
        { employeeId: employee.id, role: employee.role }, 
        JWT_SECRET, 
        { algorithm: "HS256", expiresIn: REFRESH_TOKEN_EXPIRY}
    )

    return res
      .cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict' })
      .header('Authorization', `Bearer ${token}`)
      .json({ employeeId: employee.id, name: employee.name, role: employee.role, hasReports: false
      });
};