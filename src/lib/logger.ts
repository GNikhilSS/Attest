import winston from "winston";
import { NODE_ENV } from "./env.js"

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
}

const level = () => {
    return NODE_ENV ? "debug" : "warn";
}

const colors = {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    debug: "white",
};

winston.addColors(colors);

const format = winston.format.combine(
    winston.format.timestamp({
        format: "YYYY-MM-DDTHH:mm:ss",
    }),

    winston.format.colorize({ all: true }),

    winston.format.printf(
        info => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

const transports = [
    new winston.transports.Console(),

    new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
    }),

    new winston.transports.File({
        filename: "logs/all.log",
    }),
]

export const Logger = winston.createLogger({
    level: level(),
    levels: levels,
    format: format,
    transports: transports,
    exitOnError: false,
})