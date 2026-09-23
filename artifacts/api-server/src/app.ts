import express, { type Express, type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { errorHandler } from "./lib/errors";
import { auditMiddleware } from "./lib/audit";

const app: Express = express();

// Behind the Replit proxy: required for secure cookies and correct IPs.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  helmet({
    // The Replit dev preview is iframed; CSP/COOP defaults break the proxy.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// CORS allowlist. Origins explicitly listed in ALLOWED_ORIGINS are always
// accepted (manual overrides, e.g. custom domains). On Replit we also
// auto-trust the live deployment domain(s) so the published app's logins work
// out of the box without anyone hand-maintaining the list. Same-origin requests
// carry no Origin header from the proxy and are always allowed. In development
// we reflect the request origin to keep local tooling friction-free.
const replitDomains = [
  ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  process.env.REPLIT_DEV_DOMAIN ?? "",
]
  .map((s) => s.trim())
  .filter(Boolean)
  .map((domain) => `https://${domain}`);
const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ...replitDomains,
]
  .map((s) => s.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (!isProd) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Health routes mounted before session middleware so they remain reachable
// even when the session store (backed by the DB) is unavailable.
app.use("/api", healthRouter);

app.use(sessionMiddleware);

// Rate limiting:
// - Login: 10/min per IP (brute-force defence)
// - Generic writes: 60/min per authenticated user (or per IP when anonymous)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please retry in a minute." },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request, res) =>
    req.session?.user ? `u:${req.session.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "")}`,
  message: { error: "Too many write requests, please slow down." },
});

app.use("/api/auth/login", loginLimiter);
app.use("/api", (req, _res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return writeLimiter(req, _res, next);
  return next();
});

app.use("/api", auditMiddleware);
app.use("/api", router);

app.use(errorHandler);

export default app;
