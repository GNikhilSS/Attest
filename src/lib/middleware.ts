import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

export const validateInputBody = (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        console.log(result.error)
        return res.status(400).json({ message: result.error.issues[0]?.message })
    }
    req.body = result.data;
    next();
}

export const validateInputParams = (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
        console.log(result.error)
        return res.status(400).json({ message: result.error.issues[0]?.message })
    }
    req.body = result.data;
    next();
}