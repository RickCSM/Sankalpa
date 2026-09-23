import { Router, type Request, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, auditLogTable, usersTable, departmentsTable } from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

// Roles permitted as `actorRole` filter values. Mirrors the application's
// role enum; an unknown value silently ignores the filter rather than 400ing.
const KNOWN_ROLES = new Set([
  "admin",
  "chief_minister",
  "cmo_nodal",
  "cmo_reviewer",
  "ocac_viewer",
  "dept_head",
  "dept_nodal",
  "dept_reviewer",
  "dept_user",
  "dept_viewer",
  "anonymous",
]);

/**
 * Build the WHERE clause shared by the list endpoint and the CSV export.
 * Honors the admin/dept_nodal scoping rules described inline.
 */
async function buildAuditFilters(
  req: Request,
  actor: SessionUser,
): Promise<SQL | undefined> {
  const filters: SQL[] = [];

  if (actor.role === "dept_nodal") {
    if (!actor.department) {
      throw new HttpError(403, "Department Nodal must be assigned to a department");
    }
    const deptRows = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.name, actor.department))
      .limit(1);
    if (!deptRows[0]) {
      throw new HttpError(403, "Department not found");
    }
    const deptNodalDeptId = deptRows[0].id;
    filters.push(eq(auditLogTable.targetTable, "users"));
    filters.push(
      sql`${auditLogTable.targetId} IN (SELECT id FROM ${usersTable} WHERE ${usersTable.departmentId} = ${deptNodalDeptId})`,
    );
  }

  const actorIdRaw = req.query.actorId;
  if (actorIdRaw) {
    const aid = Number(actorIdRaw);
    if (Number.isInteger(aid) && aid > 0) filters.push(eq(auditLogTable.actorId, aid));
  }
  const actorRole = typeof req.query.actorRole === "string" ? req.query.actorRole : null;
  if (actorRole && KNOWN_ROLES.has(actorRole)) {
    filters.push(eq(auditLogTable.actorRole, actorRole));
  }
  const action = typeof req.query.action === "string" ? req.query.action : null;
  if (action) filters.push(eq(auditLogTable.action, action));
  const targetTable = typeof req.query.targetTable === "string" ? req.query.targetTable : null;
  if (targetTable) filters.push(eq(auditLogTable.targetTable, targetTable));
  const from = typeof req.query.from === "string" ? req.query.from : null;
  if (from) filters.push(gte(auditLogTable.createdAt, new Date(from)));
  const to = typeof req.query.to === "string" ? req.query.to : null;
  if (to) filters.push(lte(auditLogTable.createdAt, new Date(to)));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    const like = `%${search}%`;
    const cond = or(
      ilike(auditLogTable.action, like),
      ilike(auditLogTable.route, like),
      ilike(usersTable.name, like),
    );
    if (cond) filters.push(cond);
  }
  return filters.length ? and(...filters) : undefined;
}

/** Quote a single CSV cell, escaping commas, quotes and newlines per RFC 4180. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (actor.role !== "admin" && actor.role !== "dept_nodal") {
      throw new HttpError(403, "Forbidden");
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;

    const where = await buildAuditFilters(req, actor);

    const totalRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.actorId, usersTable.id))
      .where(where ?? sql`TRUE`);
    const total = totalRows[0]?.c ?? 0;

    const AUDIT_SORT_COLUMNS: Record<string, Parameters<typeof asc>[0]> = {
      createdAt: auditLogTable.createdAt,
      actorName: usersTable.name,
      actorRole: auditLogTable.actorRole,
      action: auditLogTable.action,
      targetTable: auditLogTable.targetTable,
      route: auditLogTable.route,
      id: auditLogTable.id,
    };
    const auditSortByParam = typeof req.query.sortBy === "string" ? req.query.sortBy : "id";
    const auditValidKey = auditSortByParam in AUDIT_SORT_COLUMNS;
    const auditSortDir = (auditValidKey && req.query.sortDir === "asc") ? "asc" : "desc";
    const auditSortCol = auditValidKey ? AUDIT_SORT_COLUMNS[auditSortByParam] : auditLogTable.id;
    const auditEffectiveSortBy = auditValidKey ? auditSortByParam : "id";
    const auditOrder = auditSortDir === "asc" ? asc(auditSortCol) : desc(auditSortCol);
    const auditTiebreaker = auditEffectiveSortBy === "id" ? [] : [desc(auditLogTable.id)];

    const rows = await db
      .select({
        id: auditLogTable.id,
        actorId: auditLogTable.actorId,
        actorName: usersTable.name,
        actorRole: auditLogTable.actorRole,
        method: auditLogTable.method,
        route: auditLogTable.route,
        action: auditLogTable.action,
        targetTable: auditLogTable.targetTable,
        targetId: auditLogTable.targetId,
        before: auditLogTable.before,
        after: auditLogTable.after,
        ip: auditLogTable.ip,
        userAgent: auditLogTable.userAgent,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.actorId, usersTable.id))
      .where(where ?? sql`TRUE`)
      .orderBy(auditOrder, ...auditTiebreaker)
      .limit(pageSize)
      .offset(offset);

    res.json({ entries: rows, total, page, pageSize });
  }),
);

/**
 * CSV export of the current filter set. Hard-capped at 10,000 rows so a
 * pathological filter doesn't OOM the server or hang the download. Honors
 * the same admin/dept_nodal scoping as the list endpoint.
 */
const EXPORT_ROW_CAP = 10_000;

router.get(
  "/audit-log/export",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (actor.role !== "admin" && actor.role !== "dept_nodal") {
      throw new HttpError(403, "Forbidden");
    }

    const where = await buildAuditFilters(req, actor);

    const rows = await db
      .select({
        id: auditLogTable.id,
        createdAt: auditLogTable.createdAt,
        actorId: auditLogTable.actorId,
        actorName: usersTable.name,
        actorRole: auditLogTable.actorRole,
        action: auditLogTable.action,
        method: auditLogTable.method,
        route: auditLogTable.route,
        targetTable: auditLogTable.targetTable,
        targetId: auditLogTable.targetId,
        ip: auditLogTable.ip,
        userAgent: auditLogTable.userAgent,
        before: auditLogTable.before,
        after: auditLogTable.after,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.actorId, usersTable.id))
      .where(where ?? sql`TRUE`)
      .orderBy(desc(auditLogTable.id))
      .limit(EXPORT_ROW_CAP);

    const headers = [
      "id", "timestamp", "actor_id", "actor_name", "actor_role",
      "action", "method", "route", "target_table", "target_id",
      "ip", "user_agent", "before", "after",
    ];
    const lines: string[] = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        csvCell(r.id),
        csvCell(r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt),
        csvCell(r.actorId),
        csvCell(r.actorName),
        csvCell(r.actorRole),
        csvCell(r.action),
        csvCell(r.method),
        csvCell(r.route),
        csvCell(r.targetTable),
        csvCell(r.targetId),
        csvCell(r.ip),
        csvCell(r.userAgent),
        csvCell(r.before),
        csvCell(r.after),
      ].join(","));
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="activity-log-${ts}.csv"`);
    res.setHeader("X-Audit-Export-Rows", String(rows.length));
    res.setHeader("X-Audit-Export-Capped", rows.length >= EXPORT_ROW_CAP ? "1" : "0");
    res.send(lines.join("\n"));
  }),
);

export default router;
