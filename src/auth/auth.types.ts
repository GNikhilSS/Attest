import type { Request } from "express";

export type TokenPayload = { 
    employeeId: number
};

export interface AuthedRequest extends Request {
    employee: TokenPayload;
}