//DONE
// - Reads the Bearer token and rejects a missing or malformed header with 401.
// - Verifies the signature and expiry with HS256 pinned.
// - Rejects tokens whose payload lacks a numeric employeeId.
// - Attaches the verified payload to the request for routes to use.

// NOT DONE
// - Messages differ (“authHeader undefined”, “token undefined”, “jwt err callback”, “jwt decoded err”). Use one generic “Unauthorized” for all, per our rule.
// - The header split uses a single space. A header with two spaces or a tab fails silently. Acceptable, but worth a note.
// - A token for an employee who has since been deleted still passes. Known POC gap: the token is trusted until it expires.
// - A token is accepted even if it was issued by an earlier secret rotation window; there is no revocation.
// - The payload type is asserted, not validated beyond the employeeId check. Fine for the POC.
// - The middleware is async-free and correct; no change needed there.

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