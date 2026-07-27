/**
 * Typed application errors (ARCHITECTURE.md §10).
 *
 * Everything the client sees comes out as { error: { code, message, details? } }.
 * Only 5xx reaches Sentry — a 401 is not an incident.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REUSED: "TOKEN_REUSED",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, 422, message, details);
  }

  static unauthorized(message = "Not signed in", code: ErrorCode = ERROR_CODES.UNAUTHORIZED): AppError {
    return new AppError(code, 401, message);
  }

  static forbidden(message = "Not allowed"): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, 403, message);
  }

  static notFound(message = "Not found"): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, 404, message);
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): AppError {
    return new AppError(code, 409, message);
  }

  static internal(message = "Something went wrong"): AppError {
    return new AppError(ERROR_CODES.INTERNAL, 500, message);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
