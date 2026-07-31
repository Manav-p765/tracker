import winston from "winston";

/** JSON in production, readable in dev — same shape as the API's logger. */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  defaultMeta: { service: "worker" },
  format:
    process.env.NODE_ENV === "production"
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(
          winston.format.timestamp({ format: "HH:mm:ss" }),
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const rest = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
            return `${String(timestamp)} ${level} ${String(message)}${rest}`;
          }),
        ),
  transports: [new winston.transports.Console()],
  silent: process.env.NODE_ENV === "test",
});
