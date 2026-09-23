import type { Request, Response, NextFunction } from "express";
import { db, auditLogTable } from "@workspace/db";
import { logger } from "./logger";

/** Minimal Drizzle-tx-or-db handle accepted by writeAudit. */
type TxLike = Pick<typeof db, "insert">;

export interface AuditCtx {
  actorId: number | null;
  actorRole: string;
  method: string;
  route: string;
  action: string;
  targetTable: string;
  targetId?: number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/** Mark the response so the audit middleware skips writing again. */
export function markAudited(res: Response): void {
  res.locals.auditedInline = true;
}

/**
 * Build an AuditCtx from the request + caller-supplied action/target. Reads
 * actor from the session (caller must ensure requireAuth ran).
 */
export function auditCtx(
  req: Request,
  action: string,
  targetTable: string,
  targetId?: number | null,
  extra?: { before?: unknown; after?: unknown },
): AuditCtx {
  const actor = req.session?.user;
  if (!actor) throw new Error("auditCtx called without an authenticated session");
  return {
    actorId: actor.id,
    actorRole: actor.role,
    method: req.method.toUpperCase(),
    route: (req.originalUrl ?? req.url).split("?")[0]!,
    action,
    targetTable,
    targetId: targetId ?? null,
    before: extra?.before,
    after: extra?.after,
    ip: clientIp(req),
    userAgent: clientUserAgent(req),
  };
}

/**
 * Resolve the client IP. `app.set("trust proxy", 1)` is configured at the
 * Express bootstrap, so `req.ip` is the upstream client (Replit proxy hop)
 * rather than the loopback address.
 */
export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** First 500 chars of the User-Agent header. Truncated to bound row size. */
export function clientUserAgent(req: Request): string | null {
  const ua = req.get("user-agent");
  if (!ua) return null;
  return ua.length > 500 ? ua.slice(0, 500) : ua;
}

/**
 * Transactional audit writer. Call inside a `db.transaction(async (tx) => …)`
 * so the audit row commits atomically with the underlying state change. For
 * non-transactional auth events (login/logout/change-password) pass `db`.
 *
 * Throws if the insert fails — callers inside a tx WILL roll back. That is
 * intentional: an un-auditable mutation must not silently apply.
 */
export async function writeAudit(tx: TxLike, ctx: AuditCtx): Promise<void> {
  await tx.insert(auditLogTable).values({
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    method: ctx.method,
    route: ctx.route,
    action: ctx.action,
    targetTable: ctx.targetTable,
    targetId: ctx.targetId ?? null,
    before: sanitize(ctx.before),
    after: sanitize(ctx.after),
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });
}

/**
 * Audit middleware: best-effort coverage for non-transactional and
 * not-yet-converted mutation routes (auth events, simple inserts). Logs
 * every successful (2xx) write request by an authenticated user.
 *
 * IMPORTANT: this fires on `res.finish` and writes OUTSIDE the request's
 * transaction. Routes that mutate workflow state should call `writeAudit(tx, …)`
 * inline so the audit row commits or rolls back with the change.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    next();
    return;
  }
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    if (res.locals?.auditedInline) return; // route already wrote inside its tx
    const user = req.session?.user;
    if (!user) return;
    const route = req.originalUrl.split("?")[0] ?? req.url;
    const action = inferAction(method, route);
    const targetTable = inferTargetTable(route);
    const targetId = inferTargetId(req.params as Record<string, string | undefined>);
    db.insert(auditLogTable)
      .values({
        actorId: user.id,
        actorRole: user.role,
        method,
        route,
        action,
        targetTable,
        targetId,
        before: null,
        after: sanitizeBody(req.body),
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
      })
      .catch((err) => logger.warn({ err }, "audit log insert failed"));
  });
  next();
}

function inferTargetTable(route: string): string {
  // Routes that act on a sub-resource get a more specific target table so
  // the audit-log filter ("Filter by Target") can distinguish them.
  if (route.includes("/attachments")) return "announcement_attachments";
  if (route.includes("/sub-components")) return "subcomponents";
  if (route.includes("/comments")) return "announcement_comments";
  const m = route.match(/^\/api\/([a-z-]+)/);
  return m?.[1] ?? "unknown";
}

function inferTargetId(params: Record<string, string | undefined>): number | null {
  const raw = params?.id;
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function inferAction(method: string, route: string): string {
  if (route.endsWith("/login")) return "auth.login";
  if (route.endsWith("/logout")) return "auth.logout";
  if (route.endsWith("/change-password")) return "auth.change_password";
  if (route.includes("/submit")) return "announcement.submit";
  if (route.includes("/review")) return "announcement.review";
  if (route.includes("/accept")) return "announcement.accept";
  if (route.includes("/assign")) return "announcement.assign";
  if (route.includes("/complete")) return "announcement.complete";
  if (route.includes("/sub-components")) return `subcomponent.${method.toLowerCase()}`;
  if (route.includes("/attachments")) return `attachment.${method.toLowerCase()}`;
  if (route.includes("/notifications")) return `notification.${method.toLowerCase()}`;
  return `${inferTargetTable(route)}.${method.toLowerCase()}`;
}

function sanitizeBody(body: unknown): unknown {
  return sanitize(body);
}

const REDACT_KEYS = new Set(["password", "currentPassword", "newPassword", "passwordHash"]);

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k) ? "[redacted]" : sanitize(v);
  }
  return out;
}
