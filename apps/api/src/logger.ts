/**
 * Winston (ARCHITECTURE.md §10): JSON in production, readable in dev, and a
 * requestId on every line via a child logger bound in the request-id middleware.
 */

import winston from "winston";

import { env, isProduction, isTestEnv } from "./env.js";

const devFormat = winston.format.combine(
  winston.format.colorize({ level: true }),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf((info) => {
    const { timestamp, level, message, requestId, stack, ...rest } = info;
    const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
    const id = typeof requestId === "string" ? ` [${requestId.slice(0, 8)}]` : "";
    return `${String(timestamp)} ${level}${id} ${String(message)}${tail}${
      typeof stack === "string" ? `\n${stack}` : ""
    }`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: "api" },
  transports: [new winston.transports.Console()],
  // Tests assert on behaviour, not on log output.
  silent: isTestEnv,
});

export type Logger = winston.Logger;
