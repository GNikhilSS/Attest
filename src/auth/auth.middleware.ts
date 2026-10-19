import type { Request, Response, NextFunction } from 'express';
import type { TokenPayload, AuthedRequest } from './auth.types.js';
import jwt  from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/env.js';


export const verify = (req: Request, res: Response, next: NextFunction) => {
    const authHeaderSplit = req.headers['authorization']?.split(' ');

    if (authHeaderSplit === undefined || authHeaderSplit[0] !== "Bearer") {
        return res.status(401).json({ message: "authHeader undefined" });
    }
    const token = authHeaderSplit[1];

    if (!token) {
        return res.status(401).json({ message: "token undefined" });
    }

    jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"]},  (err, decoded) => {
        if (err) return res.status(401).json({ message: "jwt err callback" });

        if (
            typeof decoded !== 'object' ||
            typeof decoded === null ||
            typeof (decoded as TokenPayload).employeeId !== "number"
        ) {
            return res.status(401).json({ message: "jwt decoded err" });
        }

        (req as AuthedRequest).employee = decoded as TokenPayload;
        next();
    })
}