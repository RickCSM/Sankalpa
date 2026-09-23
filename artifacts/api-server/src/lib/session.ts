import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const PgStore = connectPgSimple(session);

// Rolling idle expiry (cookie maxAge resets on every request because
// `rolling: true` below). A user inactive longer than the configured window
// must re-authenticate. Default 8h; override with SESSION_IDLE_HOURS
// (must be a positive integer between 1 and 168).
const DEFAULT_IDLE_HOURS = 8;
function resolveIdleHours(): number {
  const raw = process.env.SESSION_IDLE_HOURS;
  if (raw === undefined || raw === "") return DEFAULT_IDLE_HOURS;
  // Reject non-integer / out-of-range values explicitly.
  if (!/^\d+$/.test(raw.trim())) {
    logger.warn(
      { SESSION_IDLE_HOURS: raw },
      `SESSION_IDLE_HOURS must be a positive integer; falling back to ${DEFAULT_IDLE_HOURS}h`,
    );
    return DEFAULT_IDLE_HOURS;
  }
  const hours = Number(raw);
  if (hours <= 0 || hours > 168) {
    logger.warn(
      { SESSION_IDLE_HOURS: raw },
      `SESSION_IDLE_HOURS must be between 1 and 168; falling back to ${DEFAULT_IDLE_HOURS}h`,
    );
    return DEFAULT_IDLE_HOURS;
  }
  return hours;
}
const IDLE_HOURS = resolveIdleHours();
const IDLE_MS = IDLE_HOURS * 60 * 60 * 1000;
logger.info({ idleHours: IDLE_HOURS }, "Session idle expiry configured");

function resolveSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production (>= 16 characters).",
    );
  }
  logger.warn(
    "SESSION_SECRET is not set; using insecure development fallback. Set SESSION_SECRET for production.",
  );
  return "sankalpa-dev-only-secret-do-not-use-in-prod";
}

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  name: "sankalpa.sid",
  secret: resolveSecret(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: IDLE_MS,
    path: "/",
  },
});
