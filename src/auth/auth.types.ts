import type { Request } from "express";
import type { Role } from "../../generated/prisma/enums.js";

export type TokenPayload = { 
    employeeId: number
    role : Role;
};

export interface AuthedRequest extends Request {
    employee: TokenPayload;
}