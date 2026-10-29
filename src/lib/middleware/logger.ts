import type { Request, Response, NextFunction } from "express";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const { createLogger, transports } = winston;
const { combine, timestamp, json, printf } = winston.format

const timestampFormat = 'MMM-DD-YYYY HH:mm:ss';
const datePattern = 'MMMM-DD-YYYY'

const formatHTTPLoggerResponse = (
    req: Request,
    res: Response,
    responseBody: any
) => {
    return {
        request: {
            headers: req.headers,
            host: req.host,
            baseUrl: req.baseUrl,
            url: req.url,
            method: req.method,
            body: req.body,
            params: req?.params,
            query: req?.query,
        },
        response: {
            headers: res.getHeaders(),
            statusCode: res.statusCode,
            body: responseBody
        }
    };
}

export const httpLogger = createLogger({
    format: combine(
        timestamp({ format: timestampFormat }),
        json(),
        printf(({ timestamp, level, message, ...data }) => {
            const response = {
                level,
                timestamp,
                message,
                data, // metadata
            };

            return JSON.stringify(response);
        })
    ),
    transports: [
        // new transports.Console(),
        new winston.transports.File({
            filename: 'logs/application-logs.log',
        }),
        new DailyRotateFile({
            filename: `logs/rotating-logs-%DATE%.log`,
            datePattern: datePattern,
            zippedArchive: false, // zip logs true/false
            maxSize: '20m', // rotate if file size exceeds 20 MB
            maxFiles: '14d'
        })
    ]
})

// Middleware which uses above logger instance
export const responseInterceptor = (
    req: Request,
    res: Response,
    next: NextFunction
) => {

    const originalSend = res.send;

    let responseSent = false;

    res.send = function (body: any): Response {
        if (!responseSent) {
            if (res.statusCode < 400) {
                httpLogger.info(
                    body?.message,
                    formatHTTPLoggerResponse(req, res, body)
                );
            } else {
                httpLogger.error(
                    body.message,
                    formatHTTPLoggerResponse(req, res, body)
                );
            }

            responseSent = true;
        }

        return originalSend.call(this, body);
    }

    next();
}