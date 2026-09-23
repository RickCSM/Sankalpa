import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/** pg / node-postgres error codes that indicate the DB is unreachable. */
function isDatabaseUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  // POSIX errno codes set by node-postgres on connection failure
  if (typeof e["code"] === "string") {
    const code = e["code"];
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      // PostgreSQL server-side "cannot connect now" / "admin shutdown"
      code === "57P03" ||
      code === "57P01"
    ) return true;
  }
  // connect-pg-simple / pg sometimes surfaces this as a message
  const msg = typeof e["message"] === "string" ? e["message"].toLowerCase() : "";
  if (
    msg.includes("connection terminated") ||
    msg.includes("connection refused") ||
    msg.includes("connect econnrefused")
  ) return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // express requires the 4-arg signature for error middleware
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    // Build a human-readable summary from the first 3 issues so that
    // frontend extractors that only read `error` get actionable text.
    const summary = err.issues
      .slice(0, 3)
      .map((i) => {
        const field = i.path.length > 0 ? i.path.join(".") + ": " : "";
        return field + i.message;
      })
      .join("; ");
    res.status(400).json({ error: summary || "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (isDatabaseUnavailable(err)) {
    logger.error({ err }, "Database unavailable");
    res.status(503).json({ error: "Database temporarily unavailable. Please retry in a moment." });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
