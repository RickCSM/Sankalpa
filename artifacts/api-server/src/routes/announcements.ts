import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, asc, desc, inArray, sql, type SQL } from "drizzle-orm";
import { type PgColumn } from "drizzle-orm/pg-core";
import {
  db,
  announcementsTable,
  announcementCommentsTable,
  subComponentsTable,
  subComponentRemarksTable,
  departmentsTable,
  categoriesTable,
  usersTable,
  workflowStatuses,
  subComponentStatuses,
  type WorkflowStatus,
} from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth, type SessionUser } from "../lib/auth";
import {
  pickNextCmoReviewerId,
  loadForUpdate,
  applyUpdate,
  addComment,
  notify,
  deptUsersOf,
  allCmoReviewers,
  allCmoNodals,
  selectHydrated,
  nextUniqueId,
  buildVisibilityClause,
  PRE_PUBLICATION_STATUSES,
  POST_PUBLICATION_STATUSES,
} from "../lib/workflow";
import { announcementAttachmentsTable } from "@workspace/db";
import { writeAudit, markAudited, auditCtx } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

const statusEnum = z.enum(workflowStatuses);

// ---------- Helpers ----------

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const top = (err as { code?: string }).code;
  if (typeof top === "string") return top;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const c = (cause as { code?: string }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

async function resolveDeptId(name: string): Promise<number> {
  const rows = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, name.trim()))
    .limit(1);
  if (!rows[0]) throw new HttpError(400, `Unknown department: ${name}`);
  return rows[0].id;
}

async function resolveCategoryId(name: string | null | undefined): Promise<number | null> {
  if (!name) return null;
  const rows = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.name, name.trim()))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ---------- Aggregation helpers ----------
//
// LOCKSTEP: these status buckets MUST stay identical to
// sankalpa-odisha/src/data/statusGroups.ts. KPI counts, the announcements
// list filter, and these server aggregates must never drift, or a count
// will stop equalling the rows shown when a user drills into it.
const STATUS_BUCKETS = {
  completed: ["completed"],
  inReview: ["pending_cmo_review", "pending_completion_review", "pending_cmo_completion_review", "pending_dept_acceptance"],
  inProgress: ["in_progress", "accepted"],
  notStarted: ["draft", "reverted_by_cmo", "pending_cmo_reconsideration", "published", "reverted_by_dept_reviewer", "dropped", "on_hold"],
} as const;

function bucketCountSelect() {
  return {
    total: sql<number>`COUNT(*)::int`,
    completed: sql<number>`COUNT(*) FILTER (WHERE ${inArray(announcementsTable.workflowStatus, [...STATUS_BUCKETS.completed])})::int`,
    inReview: sql<number>`COUNT(*) FILTER (WHERE ${inArray(announcementsTable.workflowStatus, [...STATUS_BUCKETS.inReview])})::int`,
    inProgress: sql<number>`COUNT(*) FILTER (WHERE ${inArray(announcementsTable.workflowStatus, [...STATUS_BUCKETS.inProgress])})::int`,
    notStarted: sql<number>`COUNT(*) FILTER (WHERE ${inArray(announcementsTable.workflowStatus, [...STATUS_BUCKETS.notStarted])})::int`,
  };
}

// Mirrors the client draft rules so server counts match each view exactly:
// reports use excludeDrafts (no drafts); the dashboard uses
// filterVisibleAnnouncements (a creator still sees their OWN drafts). 'all'
// applies no draft filter. Note buildVisibilityClause already hides drafts
// for most roles; this only adds the extra rule for admins (who see all).
function draftClause(mode: string, actorId: number): SQL | undefined {
  if (mode === "exclude") return sql`${announcementsTable.workflowStatus} <> 'draft'`;
  if (mode === "all") return undefined;
  return sql`(${announcementsTable.workflowStatus} <> 'draft' OR ${announcementsTable.createdBy} = ${actorId})`;
}

// Parse the subset of list filters aggregates share with GET /announcements,
// so a scoped aggregate counts exactly the rows the equivalent filtered list
// returns. unknownDept=true mirrors the list endpoint returning empty for an
// unresolvable department name.
async function parseCommonFilters(query: Record<string, unknown>): Promise<{ filters: SQL[]; unknownDept: boolean }> {
  const filters: SQL[] = [];
  const statusParam = typeof query.status === "string" ? query.status : "";
  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean) as WorkflowStatus[];
    if (statuses.length > 0) filters.push(inArray(announcementsTable.workflowStatus, statuses));
  }
  let unknownDept = false;
  const dept = typeof query.department === "string" ? query.department.trim() : "";
  if (dept) {
    try {
      const deptId = await resolveDeptId(dept);
      filters.push(eq(announcementsTable.departmentId, deptId));
    } catch {
      unknownDept = true;
    }
  }
  const district = typeof query.district === "string" ? query.district.trim() : "";
  if (district) filters.push(eq(announcementsTable.district, district));
  const dateFrom = typeof query.dateFrom === "string" ? query.dateFrom : "";
  if (dateFrom) filters.push(sql`${announcementsTable.date} >= ${dateFrom}`);
  const dateTo = typeof query.dateTo === "string" ? query.dateTo : "";
  if (dateTo) filters.push(sql`${announcementsTable.date} <= ${dateTo}`);
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    filters.push(
      sql`(LOWER(${announcementsTable.title}) LIKE ${like}
        OR LOWER(${announcementsTable.uniqueId}) LIKE ${like}
        OR LOWER(COALESCE(${announcementsTable.occasion}, '')) LIKE ${like}
        OR LOWER(COALESCE(${announcementsTable.location}, '')) LIKE ${like}
        OR LOWER(COALESCE(${announcementsTable.description}, '')) LIKE ${like})`,
    );
  }
  const createdBy = Number(query.createdBy);
  if (Number.isInteger(createdBy) && createdBy > 0) filters.push(eq(announcementsTable.createdBy, createdBy));
  return { filters, unknownDept };
}

const AGG_GROUP_COLS: Record<string, PgColumn> = {
  department: departmentsTable.name,
  district: announcementsTable.district,
  block: announcementsTable.block,
  occasion: announcementsTable.occasion,
};

// ---------- READ ENDPOINTS ----------

router.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;
    const baseWhere = await buildVisibilityClause(actor);

    // Server-side filters
    const filters = [];
    const statusParam = typeof req.query.status === "string" ? req.query.status : "";
    if (statusParam) {
      const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean) as WorkflowStatus[];
      if (statuses.length > 0) {
        filters.push(inArray(announcementsTable.workflowStatus, statuses));
      }
    }
    const dept = typeof req.query.department === "string" ? req.query.department.trim() : "";
    if (dept) {
      try {
        const deptId = await resolveDeptId(dept);
        filters.push(eq(announcementsTable.departmentId, deptId));
      } catch {
        res.json({ announcements: [], total: 0, page, pageSize });
        return;
      }
    }
    const district = typeof req.query.district === "string" ? req.query.district.trim() : "";
    if (district) filters.push(eq(announcementsTable.district, district));
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
    if (dateFrom) filters.push(sql`${announcementsTable.date} >= ${dateFrom}`);
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : "";
    if (dateTo) filters.push(sql`${announcementsTable.date} <= ${dateTo}`);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      filters.push(
        sql`(LOWER(${announcementsTable.title}) LIKE ${like}
          OR LOWER(${announcementsTable.uniqueId}) LIKE ${like}
          OR LOWER(COALESCE(${announcementsTable.occasion}, '')) LIKE ${like}
          OR LOWER(COALESCE(${announcementsTable.location}, '')) LIKE ${like}
          OR LOWER(COALESCE(${announcementsTable.description}, '')) LIKE ${like})`,
      );
    }
    const cmoRev = Number(req.query.assignedCmoReviewerId);
    if (Number.isInteger(cmoRev) && cmoRev > 0) {
      filters.push(eq(announcementsTable.assignedCmoReviewerId, cmoRev));
    }
    const createdBy = Number(req.query.createdBy);
    if (Number.isInteger(createdBy) && createdBy > 0) {
      filters.push(eq(announcementsTable.createdBy, createdBy));
    }
    // Filter on_hold items by the status they would be restored to on resume.
    // Used to scope a reviewer's hold queue to only items they can actually
    // resume (resume auth checks the pre-hold status, not the current on_hold).
    const sbhParam = typeof req.query.statusBeforeHold === "string" ? req.query.statusBeforeHold : "";
    if (sbhParam) {
      const sbh = sbhParam.split(",").map((s) => s.trim()).filter(Boolean) as WorkflowStatus[];
      if (sbh.length > 0) {
        filters.push(inArray(announcementsTable.statusBeforeHold, sbh));
      }
    }

    const where =
      baseWhere && filters.length > 0
        ? and(baseWhere, ...filters)
        : baseWhere ?? (filters.length > 0 ? and(...filters) : undefined);

    const totalRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementsTable)
      .where(where ?? sql`TRUE`);
    const total = totalRows[0]?.c ?? 0;

    // Sorting
    const SORT_COLUMNS: Record<string, Parameters<typeof asc>[0]> = {
      uniqueId: announcementsTable.uniqueId,
      title: announcementsTable.title,
      date: announcementsTable.date,
      department: departmentsTable.name,
      occasion: announcementsTable.occasion,
      location: announcementsTable.location,
      district: announcementsTable.district,
      category: categoriesTable.name,
      workflowStatus: announcementsTable.workflowStatus,
      createdBy: announcementsTable.createdBy,
      id: announcementsTable.id,
    };
    const sortByParam = typeof req.query.sortBy === "string" ? req.query.sortBy : "id";
    const validKey = sortByParam in SORT_COLUMNS;
    const sortDirParam = (validKey && req.query.sortDir === "asc") ? "asc" : "desc";
    const sortCol = validKey ? SORT_COLUMNS[sortByParam] : announcementsTable.id;
    const effectiveSortBy = validKey ? sortByParam : "id";
    const orderExpr = sortDirParam === "asc" ? asc(sortCol) : desc(sortCol);
    // Always add id as tiebreaker for stable ordering across pages.
    const tiebreaker = effectiveSortBy === "id" ? [] : [desc(announcementsTable.id)];

    const rows = await (where ? selectHydrated().where(where) : selectHydrated())
      .orderBy(orderExpr, ...tiebreaker)
      .limit(pageSize)
      .offset(offset);
    res.json({ announcements: rows, total, page, pageSize });
  }),
);

router.get(
  "/announcements/stats/by-department",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const vis = await buildVisibilityClause(actor);
    const rows = await db
      .select({
        department: departmentsTable.name,
        total:      sql<number>`COUNT(*)::int`,
        completed:  sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.workflowStatus} = 'completed')::int`,
        inReview:   sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.workflowStatus} IN ('pending_cmo_review','pending_completion_review','pending_cmo_completion_review','pending_dept_acceptance'))::int`,
        inProgress: sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.workflowStatus} IN ('in_progress','accepted'))::int`,
        notStarted: sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.workflowStatus} IN ('draft','reverted_by_cmo','pending_cmo_reconsideration','published','reverted_by_dept_reviewer','dropped','on_hold'))::int`,
      })
      .from(announcementsTable)
      .innerJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
      .where(vis ?? sql`TRUE`)
      .groupBy(departmentsTable.name);

    const stats: Record<string, { total: number; completed: number; inReview: number; inProgress: number; notStarted: number }> = {};
    for (const row of rows) {
      if (row.department) {
        stats[row.department] = {
          total: row.total,
          completed: row.completed,
          inReview: row.inReview,
          inProgress: row.inProgress,
          notStarted: row.notStarted,
        };
      }
    }
    res.json({ stats });
  }),
);

// Uncapped status-bucket aggregates over the full visible dataset. Replaces
// the old client-side "most recent 200" computation so every dashboard KPI
// and report count reflects ALL matching rows. Reuses buildVisibilityClause
// (counts match the list endpoint), the shared filter parser, and the draft
// rules above.
router.get(
  "/announcements/aggregate",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const groupByParam = typeof req.query.groupBy === "string" ? req.query.groupBy : "none";
    const draftModeParam = typeof req.query.draftMode === "string" ? req.query.draftMode : "own";

    const vis = await buildVisibilityClause(actor);
    const { filters, unknownDept } = await parseCommonFilters(req.query);
    const emptyOverall = { total: 0, completed: 0, inReview: 0, inProgress: 0, notStarted: 0 };
    if (unknownDept) {
      res.json({ buckets: [], overall: emptyOverall });
      return;
    }
    const draft = draftClause(draftModeParam, actor.id);
    const conds = [vis, draft, ...filters].filter((c): c is SQL => Boolean(c));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const overallRows = await db
      .select(bucketCountSelect())
      .from(announcementsTable)
      .leftJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
      .where(where ?? sql`TRUE`);
    const overall = overallRows[0] ?? emptyOverall;

    let buckets: Array<{ key: string; total: number; completed: number; inReview: number; inProgress: number; notStarted: number }> = [];
    if (groupByParam !== "none") {
      const groupCol = AGG_GROUP_COLS[groupByParam];
      if (!groupCol) throw new HttpError(400, "Invalid groupBy");
      buckets = await db
        .select({ key: sql<string>`COALESCE(${groupCol}::text, '')`, ...bucketCountSelect() })
        .from(announcementsTable)
        .leftJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
        .where(where ?? sql`TRUE`)
        .groupBy(groupCol);
    }
    res.json({ buckets, overall });
  }),
);

// Uncapped aging breakdown: per-department counts in the same four day-age
// buckets the client uses (0-7, 8-30, 31-60, 61+). Mirrors getDaysSince()
// (floor of now-minus-date in days, clamped at 0). Reports exclude drafts.
router.get(
  "/announcements/aggregate/aging",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const draftModeParam = typeof req.query.draftMode === "string" ? req.query.draftMode : "exclude";
    const vis = await buildVisibilityClause(actor);
    const { filters, unknownDept } = await parseCommonFilters(req.query);
    const emptyOverall = { b0: 0, b1: 0, b2: 0, b3: 0, total: 0 };
    if (unknownDept) {
      res.json({ buckets: [], overall: emptyOverall });
      return;
    }
    const draft = draftClause(draftModeParam, actor.id);
    const conds = [vis, draft, ...filters].filter((c): c is SQL => Boolean(c));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const days = sql`GREATEST(0, (CURRENT_DATE - ${announcementsTable.date}::date))`;
    const agingCols = () => ({
      b0: sql<number>`COUNT(*) FILTER (WHERE ${days} BETWEEN 0 AND 7)::int`,
      b1: sql<number>`COUNT(*) FILTER (WHERE ${days} BETWEEN 8 AND 30)::int`,
      b2: sql<number>`COUNT(*) FILTER (WHERE ${days} BETWEEN 31 AND 60)::int`,
      b3: sql<number>`COUNT(*) FILTER (WHERE ${days} >= 61)::int`,
      total: sql<number>`COUNT(*)::int`,
    });
    const overallRows = await db
      .select(agingCols())
      .from(announcementsTable)
      .leftJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
      .where(where ?? sql`TRUE`);
    const overall = overallRows[0] ?? emptyOverall;
    const buckets = await db
      .select({ key: sql<string>`COALESCE(${departmentsTable.name}::text, '')`, ...agingCols() })
      .from(announcementsTable)
      .leftJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
      .where(where ?? sql`TRUE`)
      .groupBy(departmentsTable.name);
    res.json({ buckets, overall });
  }),
);

router.get(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const where = await buildVisibilityClause(actor);
    const rows = await (where
      ? selectHydrated().where(and(eq(announcementsTable.id, id), where))
      : selectHydrated().where(eq(announcementsTable.id, id))
    ).limit(1);
    if (!rows[0]) throw new HttpError(404, "Not found");
    res.json({ announcement: rows[0] });
  }),
);

// Sub-components scoped by parent-announcement visibility. Server-paginated.
router.get(
  "/sub-components",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;

    const where = await buildVisibilityClause(actor);
    const visible = await (where ? selectHydrated().where(where) : selectHydrated());
    const visibleIds = visible.map((a) => a.id);
    if (visibleIds.length === 0) {
      res.json({ subComponents: [], total: 0, page, pageSize });
      return;
    }

    const filters = [inArray(subComponentsTable.announcementId, visibleIds)];
    const assignedTo = Number(req.query.assignedTo);
    if (Number.isInteger(assignedTo) && assignedTo > 0) {
      filters.push(eq(subComponentsTable.assignedTo, assignedTo));
    }
    const annId = Number(req.query.announcementId);
    if (Number.isInteger(annId) && annId > 0) {
      filters.push(eq(subComponentsTable.announcementId, annId));
    }
    const whereSc = and(...filters);

    const totalRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(subComponentsTable)
      .where(whereSc);
    const total = totalRows[0]?.c ?? 0;

    const rows = await db
      .select({
        id: subComponentsTable.id,
        announcementId: subComponentsTable.announcementId,
        title: subComponentsTable.title,
        description: subComponentsTable.description,
        assignedTo: subComponentsTable.assignedTo,
        assignedToName: usersTable.name,
        status: subComponentsTable.status,
      })
      .from(subComponentsTable)
      .leftJoin(usersTable, eq(subComponentsTable.assignedTo, usersTable.id))
      .where(whereSc)
      .orderBy(asc(subComponentsTable.id))
      .limit(pageSize)
      .offset(offset);
    res.json({ subComponents: rows, total, page, pageSize });
  }),
);

router.get(
  "/comments",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;
    const where = await buildVisibilityClause(actor);
    const visible = await (where ? selectHydrated().where(where) : selectHydrated());
    let ids = visible.map((a) => a.id);
    const announcementIdFilter = req.query.announcementId
      ? Math.max(1, Number(req.query.announcementId)) || 0
      : 0;
    if (announcementIdFilter > 0) {
      ids = ids.filter((id) => id === announcementIdFilter);
    }
    if (ids.length === 0) {
      res.json({ comments: [], total: 0, page, pageSize });
      return;
    }
    const totalRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementCommentsTable)
      .where(inArray(announcementCommentsTable.announcementId, ids));
    const total = totalRows[0]?.c ?? 0;
    const rows = await db
      .select({
        id: announcementCommentsTable.id,
        announcementId: announcementCommentsTable.announcementId,
        userId: announcementCommentsTable.userId,
        userName: usersTable.name,
        role: usersTable.role,
        action: announcementCommentsTable.action,
        comment: announcementCommentsTable.comment,
        createdAt: announcementCommentsTable.createdAt,
      })
      .from(announcementCommentsTable)
      .leftJoin(usersTable, eq(announcementCommentsTable.userId, usersTable.id))
      .where(inArray(announcementCommentsTable.announcementId, ids))
      .orderBy(asc(announcementCommentsTable.id))
      .limit(pageSize)
      .offset(offset);
    res.json({ comments: rows, total, page, pageSize });
  }),
);

// ---------- WRITE ENDPOINTS ----------

const hasAlphanumeric = (s: string) => /[a-zA-Z0-9]/.test(s);

const createSchema = z.object({
  title: z.string().trim().min(1).max(500).refine(hasAlphanumeric, {
    message: "Title must contain at least one letter or digit",
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").refine(s => {
    const y = parseInt(s.slice(0, 4), 10);
    return !isNaN(new Date(s).getTime()) && y >= 1900 && y <= 2100;
  }, { message: "Date must be a valid calendar date between 1900 and 2100" }).refine(s => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, { message: "HCM Announcement Date cannot be a future date" }),
  description: z.string().default(""),
  department: z.string().trim().min(1),
  occasion: z.string().min(1, "Occasion is required"),
  location: z.string().min(1, "Location is required"),
  district: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  // Free-text value required when category is "Other"; ignored otherwise.
  otherCategory: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  // Legacy single-attachment field removed. Files are managed via
  // /api/announcements/:id/attachments after creation.
  // If true, save as draft instead of submitting; only the creator (CMO Nodal)
  // can use this. Defaults to submit-for-review.
  asDraft: z.boolean().optional(),
}).refine(
  (d) => d.category !== "Other" || !!d.otherCategory?.trim(),
  { message: "Please specify the category", path: ["otherCategory"] },
);

router.post(
  "/announcements",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["cmo_nodal", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only CMO Nodal can create announcements");
    }
    const data = createSchema.parse(req.body);
    const departmentId = await resolveDeptId(data.department);
    const categoryId = await resolveCategoryId(data.category ?? null);

    const result = await db.transaction(async (tx) => {
      const uniqueId = await nextUniqueId(tx);
      const status: WorkflowStatus = data.asDraft ? "draft" : "pending_cmo_review";
      const reviewerId = data.asDraft ? null : await pickNextCmoReviewerId(tx);
      try {
        const [row] = await tx
          .insert(announcementsTable)
          .values({
            uniqueId,
            house: null,
            constituencyNumber: null,
            title: data.title,
            date: data.date,
            description: data.description,
            departmentId,
            occasion: data.occasion,
            location: data.location,
            district: data.district ?? null,
            block: data.block ?? null,
            categoryId,
            otherCategory:
              data.category === "Other" ? data.otherCategory?.trim() ?? null : null,
            tags: data.tags,
            workflowStatus: status,
            createdBy: actor.id,
            assignedCmoReviewerId: reviewerId,
            version: 0,
          })
          .returning({ id: announcementsTable.id });
        const aId = row!.id;
        await addComment(
          tx,
          aId,
          actor.id,
          "Created",
          status === "draft"
            ? "Announcement saved as draft."
            : reviewerId
              ? "New announcement submitted for review."
              : "New announcement submitted for review.",
        );
        if (status === "pending_cmo_review") {
          if (reviewerId) {
            await notify(
              tx,
              [reviewerId],
              `New announcement "${data.title}" assigned to you for review.`,
              "info",
              `/announcements/${aId}`,
            );
          } else {
            const reviewers = await allCmoReviewers(tx);
            await notify(
              tx,
              reviewers,
              `New announcement "${data.title}" awaiting your review.`,
              "info",
              `/announcements/${aId}`,
            );
          }
        }
        await writeAudit(
          tx,
          auditCtx(req, "announcement.create", "announcements", aId, {
            after: { uniqueId, title: data.title, status, departmentId, assignedCmoReviewerId: reviewerId },
          }),
        );
        return aId;
      } catch (err) {
        if (pgErrorCode(err) === "23505") {
          throw new HttpError(409, "Announcement uniqueId conflict — please retry");
        }
        throw err;
      }
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, result)).limit(1);
    res.status(201).json({ announcement: fresh[0] });
  }),
);

const updateSchema = z.object({
  version: z.number().int().min(0),
  title: z.string().trim().min(1).max(500).refine(hasAlphanumeric, {
    message: "Title must contain at least one letter or digit",
  }).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").refine(s => {
    const y = parseInt(s.slice(0, 4), 10);
    return !isNaN(new Date(s).getTime()) && y >= 1900 && y <= 2100;
  }, { message: "Date must be a valid calendar date between 1900 and 2100" }).refine(s => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, { message: "HCM Announcement Date cannot be a future date" }).optional(),
  description: z.string().optional(),
  department: z.string().trim().min(1).optional(),
  occasion: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  district: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  // Free-text value required when category is "Other"; ignored otherwise.
  otherCategory: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  // Legacy single-attachment field removed; managed via attachments endpoints.
  // Constituency / house are immutable after submission.
}).refine(
  (d) => d.category !== "Other" || !!d.otherCategory?.trim(),
  { message: "Please specify the category", path: ["otherCategory"] },
);

router.patch(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = updateSchema.parse(req.body);

    // Viewer-only roles can never mutate announcements, even if they are
    // historical creators (e.g. role downgraded after creating the record).
    if (actor.role === "dept_viewer") {
      throw new HttpError(403, "Viewer roles cannot edit announcements");
    }

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      // Editable in draft / reverted_by_cmo / pending_cmo_reconsideration /
      // pending_cmo_review (recall before reviewer acts) / reverted_by_dept_reviewer.
      const editable: WorkflowStatus[] = [
        "draft",
        "reverted_by_cmo",
        "pending_cmo_reconsideration",
        "pending_cmo_review",
        "reverted_by_dept_reviewer",
      ];
      if (!editable.includes(existing.workflowStatus)) {
        throw new HttpError(409, "Announcement is not in an editable state");
      }
      const isCreatorEdit =
        ["draft", "reverted_by_cmo", "pending_cmo_reconsideration", "pending_cmo_review"].includes(existing.workflowStatus) &&
        (existing.createdBy === actor.id || actor.role === "admin");
      // Only the originally-accepting Dept Nodal (or admin) may resubmit a
      // dept-reverted closure. Mirrors the closure-gating ownership rule.
      const existingDeptName = await tx
        .select({ name: departmentsTable.name })
        .from(departmentsTable)
        .where(eq(departmentsTable.id, existing.departmentId))
        .limit(1);
      const isDeptNodalEdit =
        existing.workflowStatus === "reverted_by_dept_reviewer" &&
        !!actor.department &&
        existingDeptName[0]?.name === actor.department &&
        ((actor.role === "dept_nodal" && existing.acceptedByDeptNodalId === actor.id) ||
          actor.role === "admin");
      if (!isCreatorEdit && !isDeptNodalEdit) {
        throw new HttpError(403, "Forbidden");
      }

      const isCompletionRevert = existing.workflowStatus === "reverted_by_dept_reviewer";
      const isDraft = existing.workflowStatus === "draft";
      // "Recall & Edit" is now a single atomic operation: the announcement
      // goes directly back to pending_cmo_review with updated fields.
      // It never detours through draft, matching the "Save & Resubmit" label.
      const isRecall = existing.workflowStatus === "pending_cmo_review";
      const nextStatus: WorkflowStatus = isCompletionRevert
        ? "pending_completion_review"
        : isDraft
          ? "draft"
          : "pending_cmo_review";

      // Department is immutable on a completion-revert resubmit.
      const resolvedDeptId = isCompletionRevert
        ? existing.departmentId
        : data.department
          ? await resolveDeptId(data.department)
          : existing.departmentId;
      const resolvedCatId =
        data.category === undefined
          ? existing.categoryId
          : await resolveCategoryId(data.category);

      // Resolve how `otherCategory` should change, keeping it in lockstep with
      // the announcement's category. The free-text value may only live on an
      // "Other" announcement; for any real category it is force-cleared so a
      // stale value can't linger. We look up the existing category name so that
      // an `otherCategory`-only PATCH (no `category` in the payload) is gated by
      // the persisted category rather than blindly trusting the client.
      let otherCategoryPatch: { otherCategory: string | null } | undefined;
      if (data.category !== undefined) {
        otherCategoryPatch = {
          otherCategory:
            data.category === "Other" ? data.otherCategory?.trim() ?? null : null,
        };
      } else if (data.otherCategory !== undefined) {
        const existingCategoryName =
          existing.categoryId === null
            ? null
            : (
                await tx
                  .select({ name: categoriesTable.name })
                  .from(categoriesTable)
                  .where(eq(categoriesTable.id, existing.categoryId))
                  .limit(1)
              )[0]?.name ?? null;
        if (existingCategoryName === "Other") {
          const trimmed = data.otherCategory?.trim() ?? "";
          if (!trimmed) throw new HttpError(400, "Please specify the category");
          otherCategoryPatch = { otherCategory: trimmed };
        } else {
          otherCategoryPatch = { otherCategory: null };
        }
      }

      const set: Partial<typeof announcementsTable.$inferInsert> = {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.date !== undefined ? { date: data.date } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        departmentId: resolvedDeptId,
        ...(data.occasion !== undefined ? { occasion: data.occasion } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.block !== undefined ? { block: data.block } : {}),
        categoryId: resolvedCatId,
        ...(otherCategoryPatch ?? {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
      };

      await applyUpdate(tx, id, existing.version, { status: nextStatus, set });
      const updatedTitle = data.title ?? existing.title;

      if (isRecall) {
        // Single-step recall + resubmit: the creator edited the announcement
        // while it was in CMO review and it goes straight back into the review
        // queue. Notify the reviewer so they know there is an updated version.
        await addComment(
          tx,
          id,
          actor.id,
          "Recalled & Resubmitted",
          "Announcement recalled for editing and immediately resubmitted for CMO review.",
        );
        if (existing.assignedCmoReviewerId) {
          await notify(
            tx,
            [existing.assignedCmoReviewerId],
            `Announcement "${data.title ?? existing.title}" was recalled, edited, and resubmitted for your review.`,
            "info",
            `/announcements/${id}`,
          );
        } else {
          const reviewers = await allCmoReviewers(tx);
          await notify(
            tx,
            reviewers,
            `Announcement "${data.title ?? existing.title}" was recalled, edited, and resubmitted for review.`,
            "info",
            `/announcements/${id}`,
          );
        }
      } else if (isDraft) {
        await addComment(tx, id, actor.id, "Edited Draft", "Draft updated.");
      } else if (isCompletionRevert) {
        await addComment(
          tx,
          id,
          actor.id,
          "Resubmitted for Completion Review",
          "Announcement updated and resubmitted for completion review.",
        );
        const reviewers = await deptUsersOf(tx, existing.departmentId, ["dept_reviewer"]);
        await notify(
          tx,
          reviewers,
          `Announcement "${updatedTitle}" has been resubmitted for completion review.`,
          "info",
          `/announcements/${id}`,
        );
      } else {
        await addComment(
          tx,
          id,
          actor.id,
          "Edited & Resubmitted",
          "Announcement updated and resubmitted for CMO review.",
        );
        if (existing.assignedCmoReviewerId) {
          await notify(
            tx,
            [existing.assignedCmoReviewerId],
            `Announcement "${updatedTitle}" has been resubmitted for your review.`,
            "info",
            `/announcements/${id}`,
          );
        } else {
          const reviewers = await allCmoReviewers(tx);
          await notify(
            tx,
            reviewers,
            `Announcement "${updatedTitle}" has been resubmitted for review.`,
            "info",
            `/announcements/${id}`,
          );
        }
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.update", "announcements", id, {
          before: { status: existing.workflowStatus, version: existing.version },
          after: { status: nextStatus, fields: Object.keys(set) },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

const submitDraftSchema = z.object({ version: z.number().int().min(0) });

router.post(
  "/announcements/:id/submit",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const { version } = submitDraftSchema.parse(req.body);

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, version);
      if (existing.workflowStatus !== "draft") {
        throw new HttpError(409, "Only drafts can be submitted");
      }
      if (existing.createdBy !== actor.id && actor.role !== "admin") {
        throw new HttpError(403, "Only the creator can submit this draft");
      }
      const reviewerId = existing.assignedCmoReviewerId ?? (await pickNextCmoReviewerId(tx));
      await applyUpdate(tx, id, existing.version, {
        status: "pending_cmo_review",
        set: { assignedCmoReviewerId: reviewerId },
      });
      await addComment(tx, id, actor.id, "Submitted for Review", "Draft submitted for CMO review.");
      if (reviewerId) {
        await notify(
          tx,
          [reviewerId],
          `Announcement "${existing.title}" assigned to you for review.`,
          "info",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.submit", "announcements", id, {
          before: { status: "draft" },
          after: { status: "pending_cmo_review", assignedCmoReviewerId: reviewerId },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

const reviewSchema = z.object({
  version: z.number().int().min(0),
  action: z.enum(["approve", "revert"]),
  comment: z.string().default(""),
});

router.post(
  "/announcements/:id/review",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["cmo_reviewer", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only CMO Reviewer can review");
    }
    const id = parseId(req.params.id);
    const data = reviewSchema.parse(req.body);
    if (data.action === "revert" && !data.comment.trim()) {
      throw new HttpError(400, "A comment is required when reverting");
    }

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (existing.workflowStatus !== "pending_cmo_review") {
        throw new HttpError(409, "Announcement is not pending CMO review");
      }
      // Round-robin ownership: only the assigned reviewer (or admin) may act.
      if (
        actor.role === "cmo_reviewer" &&
        existing.assignedCmoReviewerId !== null &&
        existing.assignedCmoReviewerId !== actor.id
      ) {
        throw new HttpError(403, "Announcement is assigned to another CMO Reviewer");
      }
      const nextStatus: WorkflowStatus = data.action === "approve" ? "published" : "reverted_by_cmo";
      await applyUpdate(tx, id, existing.version, { status: nextStatus });
      await addComment(
        tx,
        id,
        actor.id,
        data.action === "approve" ? "Approved & Published" : "Reverted",
        data.comment,
      );
      if (data.action === "approve") {
        const recipients = await deptUsersOf(tx, existing.departmentId, [
          "dept_head",
          "dept_nodal",
          "dept_reviewer",
          "dept_user",
        ]);
        if (existing.createdBy && !recipients.includes(existing.createdBy)) {
          recipients.push(existing.createdBy);
        }
        await notify(
          tx,
          recipients,
          `Announcement "${existing.title}" has been published for your department.`,
          "info",
          `/announcements/${id}`,
        );
      } else {
        if (existing.createdBy !== actor.id) {
          const trimmed = data.comment.trim();
          const suffix = trimmed ? ` Reason: ${trimmed}` : "";
          await notify(
            tx,
            [existing.createdBy],
            `Announcement "${existing.title}" was reverted by CMO Reviewer.${suffix}`,
            "warning",
            `/announcements/${id}`,
          );
        }
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.review", "announcements", id, {
          before: { status: "pending_cmo_review" },
          after: { status: nextStatus, action: data.action },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

const versionOnly = z.object({ version: z.number().int().min(0) });

router.post(
  "/announcements/:id/accept",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["dept_nodal", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only Department Nodal can accept");
    }
    const id = parseId(req.params.id);
    const { version } = versionOnly.parse(req.body);

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, version);
      if (existing.workflowStatus !== "published") {
        throw new HttpError(409, "Announcement is not in a published state");
      }
      // Department scoping: dept_nodal must belong to the announcement's department.
      if (actor.role === "dept_nodal") {
        const deptName = await tx
          .select({ name: departmentsTable.name })
          .from(departmentsTable)
          .where(eq(departmentsTable.id, existing.departmentId))
          .limit(1);
        if (deptName[0]?.name !== actor.department) {
          throw new HttpError(403, "Cannot accept announcements outside your department");
        }
      }
      await applyUpdate(tx, id, existing.version, {
        status: "pending_dept_acceptance",
        set: { acceptedByDeptNodalId: actor.id },
      });
      // Default-assign sub-components to the creator if unassigned.
      const defaultAssigned = await tx
        .update(subComponentsTable)
        .set({ assignedTo: existing.createdBy })
        .where(
          and(
            eq(subComponentsTable.announcementId, id),
            sql`${subComponentsTable.assignedTo} IS NULL`,
          ),
        )
        .returning({ id: subComponentsTable.id });
      await addComment(
        tx,
        id,
        actor.id,
        "Accepted by Dept Nodal",
        "Department Nodal accepted; awaiting Department Reviewer final acceptance.",
      );
      const reviewers = await deptUsersOf(tx, existing.departmentId, ["dept_reviewer"]);
      await notify(
        tx,
        reviewers,
        `Announcement "${existing.title}" awaits your final acceptance.`,
        "info",
        `/announcements/${id}`,
      );
      if (existing.createdBy && defaultAssigned.length > 0) {
        await notify(
          tx,
          [existing.createdBy],
          `${defaultAssigned.length} unassigned sub-component${defaultAssigned.length === 1 ? "" : "s"} for "${existing.title}" have been assigned to you by default. Visit the announcement to retag them to department members.`,
          "info",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.accept", "announcements", id, {
          before: { status: "published" },
          after: { status: "pending_dept_acceptance", acceptedByDeptNodalId: actor.id },
        }),
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

const reconsiderSchema = z.object({
  version: z.number().int().min(0),
  comment: z.string().min(1),
});

router.post(
  "/announcements/:id/reconsider",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["dept_nodal", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only Department Nodal can request reconsideration");
    }
    const id = parseId(req.params.id);
    const data = reconsiderSchema.parse(req.body);
    const comment = data.comment.trim();
    if (!comment) {
      throw new HttpError(400, "A comment is required when requesting reconsideration");
    }

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      // Reconsideration is only allowed BEFORE the department accepts. Once accepted
      // (status `pending_dept_acceptance`), the announcement is committed and can no
      // longer be sent back for reconsideration.
      if (existing.workflowStatus !== "published") {
        throw new HttpError(
          409,
          "Reconsideration can only be requested before the department has accepted the announcement",
        );
      }
      // Department scoping: dept_nodal must belong to the announcement's department.
      if (actor.role === "dept_nodal") {
        const deptName = await tx
          .select({ name: departmentsTable.name })
          .from(departmentsTable)
          .where(eq(departmentsTable.id, existing.departmentId))
          .limit(1);
        if (deptName[0]?.name !== actor.department) {
          throw new HttpError(403, "Cannot reconsider announcements outside your department");
        }
      }
      const previousStatus = existing.workflowStatus;
      await applyUpdate(tx, id, existing.version, {
        status: "pending_cmo_reconsideration",
        set: { acceptedByDeptNodalId: null },
      });
      await addComment(tx, id, actor.id, "Reconsider Requested", comment);
      const recipients: number[] = [];
      if (existing.createdBy) recipients.push(existing.createdBy);
      if (
        existing.assignedCmoReviewerId &&
        !recipients.includes(existing.assignedCmoReviewerId)
      ) {
        recipients.push(existing.assignedCmoReviewerId);
      }
      if (recipients.length > 0) {
        await notify(
          tx,
          recipients,
          `Announcement "${existing.title}" has been sent back for reconsideration. Reason: ${comment}`,
          "warning",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.reconsider", "announcements", id, {
          before: { status: previousStatus },
          after: { status: "pending_cmo_reconsideration" },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/final-accept",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["dept_reviewer", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only Department Reviewer can grant final acceptance");
    }
    const id = parseId(req.params.id);
    const { version } = versionOnly.parse(req.body);
    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, version);
      if (existing.workflowStatus !== "pending_dept_acceptance") {
        throw new HttpError(409, "Announcement is not pending department acceptance");
      }
      if (actor.role === "dept_reviewer") {
        const deptName = await tx
          .select({ name: departmentsTable.name })
          .from(departmentsTable)
          .where(eq(departmentsTable.id, existing.departmentId))
          .limit(1);
        if (deptName[0]?.name !== actor.department) {
          throw new HttpError(403, "Cannot accept announcements outside your department");
        }
      }
      // If a reconsideration was raised in parallel, granting final acceptance
      // resolves the parallel state: clear the flag so it leaves the
      // reconsideration queue and notify the CMO that reconsideration is moot.
      const wasReconsiderationPending = existing.reconsiderationRequested === true;
      await applyUpdate(tx, id, existing.version, {
        status: "accepted",
        ...(wasReconsiderationPending ? { set: { reconsiderationRequested: false } } : {}),
      });
      await addComment(
        tx,
        id,
        actor.id,
        "Final Acceptance",
        "Department Reviewer granted final acceptance. Announcement is now accepted.",
      );
      const recipients: number[] = [];
      if (existing.acceptedByDeptNodalId) recipients.push(existing.acceptedByDeptNodalId);
      if (existing.createdBy) recipients.push(existing.createdBy);
      if (existing.assignedCmoReviewerId) recipients.push(existing.assignedCmoReviewerId);
      await notify(
        tx,
        recipients,
        `Announcement "${existing.title}" has been finally accepted by Department Reviewer.`,
        "success",
        `/announcements/${id}`,
      );
      if (wasReconsiderationPending) {
        const cmoRecipients: number[] = [];
        if (existing.createdBy) cmoRecipients.push(existing.createdBy);
        if (existing.assignedCmoReviewerId) cmoRecipients.push(existing.assignedCmoReviewerId);
        await notify(
          tx,
          cmoRecipients,
          `Your reconsideration request on "${existing.title}" is no longer actionable — the Department Reviewer has finally accepted it.`,
          "info",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.final_accept", "announcements", id, {
          before: { status: "pending_dept_acceptance", reconsiderationRequested: wasReconsiderationPending },
          after: { status: "accepted" },
        }),
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/start-progress",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const { version } = versionOnly.parse(req.body);
    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, version);
      if (existing.workflowStatus !== "accepted") {
        throw new HttpError(409, "Announcement must be accepted before starting progress");
      }
      const isOwnerNodal = actor.role === "dept_nodal" && existing.acceptedByDeptNodalId === actor.id;
      if (!isOwnerNodal && actor.role !== "admin") {
        throw new HttpError(403, "Only the accepting Department Nodal can start progress");
      }
      await applyUpdate(tx, id, existing.version, { status: "in_progress" });
      await addComment(
        tx,
        id,
        actor.id,
        "Started Progress",
        "Department marked the announcement as in progress.",
      );
      await writeAudit(
        tx,
        auditCtx(req, "announcement.start_progress", "announcements", id, {
          before: { status: "accepted" },
          after: { status: "in_progress" },
        }),
      );
      // Notify the Department Users who own sub-components on this announcement
      // that work has begun — they can now act on their assigned tasks.
      const subRows = await tx
        .select({ assignedTo: subComponentsTable.assignedTo })
        .from(subComponentsTable)
        .where(eq(subComponentsTable.announcementId, id));
      const assigneeIds = subRows
        .map((r) => r.assignedTo)
        .filter((x): x is number => x != null);
      await notify(
        tx,
        assigneeIds,
        `Work has begun on "${existing.title}". You can now start your assigned task(s).`,
        "info",
        `/announcements/${id}`,
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/request-completion",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const { version } = versionOnly.parse(req.body);
    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, version);
      const isOwner = actor.role === "admin" || existing.acceptedByDeptNodalId === actor.id;
      if (!isOwner) throw new HttpError(403, "Forbidden");
      if (!(["in_progress", "reverted_by_dept_reviewer"] as WorkflowStatus[]).includes(existing.workflowStatus)) {
        throw new HttpError(409, "Announcement is not in a completable state");
      }
      const subs = await tx
        .select({ status: subComponentsTable.status })
        .from(subComponentsTable)
        .where(eq(subComponentsTable.announcementId, id));
      if (subs.length === 0) {
        throw new HttpError(
          409,
          "Add at least one completed sub-component before requesting completion",
        );
      }
      if (subs.some((s) => s.status !== "Completed")) {
        throw new HttpError(409, "All sub-components must be completed first");
      }
      await applyUpdate(tx, id, existing.version, { status: "pending_completion_review" });
      await addComment(
        tx,
        id,
        actor.id,
        "Completion Requested",
        "Department Nodal Officer marked as complete, pending reviewer approval.",
      );
      const reviewers = await deptUsersOf(tx, existing.departmentId, ["dept_reviewer"]);
      await notify(
        tx,
        reviewers,
        `Announcement "${existing.title}" completion is awaiting your review.`,
        "info",
        `/announcements/${id}`,
      );
      await writeAudit(
        tx,
        auditCtx(req, "announcement.request_completion", "announcements", id, {
          before: { status: existing.workflowStatus },
          after: { status: "pending_completion_review" },
        }),
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/review-completion",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["dept_reviewer", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only Department Reviewer can review completion");
    }
    const id = parseId(req.params.id);
    const data = reviewSchema.parse(req.body);
    if (data.action === "revert" && !data.comment.trim()) {
      throw new HttpError(400, "A comment is required when reverting");
    }
    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (existing.workflowStatus !== "pending_completion_review") {
        throw new HttpError(409, "Announcement is not pending department completion review");
      }
      if (actor.role === "dept_reviewer") {
        const deptName = await tx
          .select({ name: departmentsTable.name })
          .from(departmentsTable)
          .where(eq(departmentsTable.id, existing.departmentId))
          .limit(1);
        if (deptName[0]?.name !== actor.department) {
          throw new HttpError(403, "Cannot review announcements outside your department");
        }
      }
      const nextStatus: WorkflowStatus =
        data.action === "approve" ? "pending_cmo_completion_review" : "reverted_by_dept_reviewer";
      await applyUpdate(tx, id, existing.version, { status: nextStatus });
      await addComment(
        tx,
        id,
        actor.id,
        data.action === "approve" ? "Dept Completion Approved" : "Completion Reverted",
        data.comment,
      );
      if (data.action === "approve") {
        const reviewers = await allCmoReviewers(tx);
        await notify(
          tx,
          reviewers,
          `Announcement "${existing.title}" is awaiting your final completion review.`,
          "info",
          `/announcements/${id}`,
        );
      } else {
        const recipients = existing.acceptedByDeptNodalId
          ? [existing.acceptedByDeptNodalId]
          : await deptUsersOf(tx, existing.departmentId, ["dept_nodal"]);
        const trimmed = data.comment.trim();
        const suffix = trimmed ? ` Reason: ${trimmed}` : "";
        await notify(
          tx,
          recipients,
          `Completion of "${existing.title}" was reverted by Department Reviewer.${suffix}`,
          "warning",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.review_completion", "announcements", id, {
          before: { status: "pending_completion_review" },
          after: { status: nextStatus, action: data.action },
        }),
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/review-cmo-completion",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (!["cmo_reviewer", "admin"].includes(actor.role)) {
      throw new HttpError(403, "Only CMO Reviewer can review CMO completion");
    }
    const id = parseId(req.params.id);
    const data = reviewSchema.parse(req.body);
    if (data.action === "revert" && !data.comment.trim()) {
      throw new HttpError(400, "A comment is required when reverting");
    }
    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (existing.workflowStatus !== "pending_cmo_completion_review") {
        throw new HttpError(409, "Announcement is not pending CMO completion review");
      }
      if (
        actor.role === "cmo_reviewer" &&
        existing.assignedCmoReviewerId !== null &&
        existing.assignedCmoReviewerId !== actor.id
      ) {
        throw new HttpError(403, "Announcement is assigned to another CMO Reviewer");
      }
      const nextStatus: WorkflowStatus =
        data.action === "approve" ? "completed" : "reverted_by_dept_reviewer";
      await applyUpdate(tx, id, existing.version, { status: nextStatus });
      await addComment(
        tx,
        id,
        actor.id,
        data.action === "approve" ? "CMO Completion Approved" : "CMO Completion Reverted",
        data.comment,
      );
      if (data.action === "approve") {
        const cmoReviewers = await allCmoReviewers(tx);
        const cmoNodals = await allCmoNodals(tx);
        const deptUsers = await deptUsersOf(tx, existing.departmentId, [
          "dept_head",
          "dept_nodal",
          "dept_reviewer",
          "dept_user",
        ]);
        const recipients = [...cmoReviewers, ...cmoNodals, ...deptUsers];
        if (existing.createdBy) recipients.push(existing.createdBy);
        await notify(
          tx,
          recipients,
          `Announcement "${existing.title}" has been fully completed.`,
          "success",
          `/announcements/${id}`,
        );
      } else {
        const recipients = existing.acceptedByDeptNodalId
          ? [existing.acceptedByDeptNodalId]
          : await deptUsersOf(tx, existing.departmentId, ["dept_nodal"]);
        const trimmed = data.comment.trim();
        const suffix = trimmed ? ` Reason: ${trimmed}` : "";
        await notify(
          tx,
          recipients,
          `CMO Reviewer reverted completion of "${existing.title}". Please address and resubmit.${suffix}`,
          "warning",
          `/announcements/${id}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "announcement.review_cmo_completion", "announcements", id, {
          before: { status: "pending_cmo_completion_review" },
          after: { status: nextStatus, action: data.action },
        }),
      );
    });
    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

// ---------- Drop / On-Hold ----------

const dropHoldSchema = z.object({
  version: z.number().int().min(0),
  remarks: z.string().trim().min(1, "Remarks are required"),
});

const TERMINAL_STATUSES: WorkflowStatus[] = ["completed", "dropped", "on_hold"];

/**
 * Authorize a drop/hold action against the announcement's current state.
 * The phase sets (POST_PUBLICATION_STATUSES) are imported from lib/workflow
 * so this matrix cannot drift from the attachment-write gate.
 *
 *   - admin         → always allowed (any non-terminal state)
 *   - cmo_reviewer  → only after publication (POST_PUBLICATION_STATUSES)
 *   - all others    → 403 (including cmo_nodal — lifecycle-ending actions
 *                     are not in their remit)
 */
function assertCanDropOrHold(
  actor: NonNullable<SessionUser>,
  existing: { workflowStatus: WorkflowStatus },
  verb: "drop" | "put on hold" | "resume",
): void {
  if (actor.role === "admin") return;
  if (actor.role === "cmo_reviewer") {
    if (!POST_PUBLICATION_STATUSES.has(existing.workflowStatus)) {
      throw new HttpError(
        403,
        `CMO Reviewer can only ${verb} an announcement after it has been published`,
      );
    }
    return;
  }
  throw new HttpError(403, `Only CMO Reviewer or Admin can ${verb} an announcement`);
}

router.post(
  "/announcements/:id/drop",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = dropHoldSchema.parse(req.body);

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (TERMINAL_STATUSES.includes(existing.workflowStatus)) {
        throw new HttpError(409, `Cannot drop an announcement that is already ${existing.workflowStatus}`);
      }
      assertCanDropOrHold(actor, existing, "drop");
      // Clear any pending reconsideration flag so a dropped item doesn't carry
      // stale parallel-state metadata.
      await applyUpdate(tx, id, existing.version, { status: "dropped", set: { reconsiderationRequested: false } });
      await addComment(tx, id, actor.id, "Dropped", data.remarks);
      const cmoReviewers = await allCmoReviewers(tx);
      const cmoNodals = await allCmoNodals(tx);
      const deptUsers = await deptUsersOf(tx, existing.departmentId, [
        "dept_head", "dept_nodal", "dept_reviewer", "dept_user",
      ]);
      const recipients = [...new Set([...cmoReviewers, ...cmoNodals, ...deptUsers, existing.createdBy].filter(Boolean) as number[])];
      await notify(
        tx,
        recipients,
        `Announcement "${existing.title}" has been dropped. Reason: ${data.remarks}`,
        "warning",
        `/announcements/${id}`,
      );
      await writeAudit(
        tx,
        auditCtx(req, "announcement.drop", "announcements", id, {
          before: { status: existing.workflowStatus },
          after: { status: "dropped", remarks: data.remarks },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

router.post(
  "/announcements/:id/hold",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = dropHoldSchema.parse(req.body);

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (TERMINAL_STATUSES.includes(existing.workflowStatus)) {
        throw new HttpError(409, `Cannot put an announcement on hold that is already ${existing.workflowStatus}`);
      }
      assertCanDropOrHold(actor, existing, "put on hold");
      // Clear any pending reconsideration flag so a held item doesn't carry
      // stale parallel-state metadata. Remember the pre-hold status so Resume
      // can restore it.
      await applyUpdate(tx, id, existing.version, { status: "on_hold", set: { reconsiderationRequested: false, statusBeforeHold: existing.workflowStatus } });
      await addComment(tx, id, actor.id, "Put On Hold", data.remarks);
      const cmoReviewers = await allCmoReviewers(tx);
      const cmoNodals = await allCmoNodals(tx);
      const deptUsers = await deptUsersOf(tx, existing.departmentId, [
        "dept_head", "dept_nodal", "dept_reviewer", "dept_user",
      ]);
      const recipients = [...new Set([...cmoReviewers, ...cmoNodals, ...deptUsers, existing.createdBy].filter(Boolean) as number[])];
      await notify(
        tx,
        recipients,
        `Announcement "${existing.title}" has been put on hold. Reason: ${data.remarks}`,
        "warning",
        `/announcements/${id}`,
      );
      await writeAudit(
        tx,
        auditCtx(req, "announcement.hold", "announcements", id, {
          before: { status: existing.workflowStatus },
          after: { status: "on_hold", remarks: data.remarks },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

const resumeSchema = z.object({
  version: z.number().int().min(0),
});

/**
 * Resume a held announcement, restoring it to the workflow status it had
 * immediately before it was put on hold (recorded in statusBeforeHold). Mirrors
 * the drop/hold authority: admin always, CMO Reviewer otherwise. Valid only on
 * an `on_hold` row. Legacy holds with no recorded prior status fall back to
 * "draft".
 */
router.post(
  "/announcements/:id/resume",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = resumeSchema.parse(req.body);

    await db.transaction(async (tx) => {
      const existing = await loadForUpdate(tx, id, data.version);
      if (existing.workflowStatus !== "on_hold") {
        throw new HttpError(409, "Only an announcement that is on hold can be resumed");
      }
      const restored: WorkflowStatus = existing.statusBeforeHold ?? "draft";
      // Authorize against the status the item will return to, so a CMO Reviewer
      // can only resume holds whose pre-hold state was post-publication —
      // mirroring assertCanDropOrHold exactly. (Admin is always allowed.)
      assertCanDropOrHold(actor, { workflowStatus: restored }, "resume");
      await applyUpdate(tx, id, existing.version, { status: restored, set: { statusBeforeHold: null } });
      await addComment(tx, id, actor.id, "Resumed", `Announcement resumed from hold (restored to ${restored}).`);
      const cmoReviewers = await allCmoReviewers(tx);
      const cmoNodals = await allCmoNodals(tx);
      const deptUsers = await deptUsersOf(tx, existing.departmentId, [
        "dept_head", "dept_nodal", "dept_reviewer", "dept_user",
      ]);
      const recipients = [...new Set([...cmoReviewers, ...cmoNodals, ...deptUsers, existing.createdBy].filter(Boolean) as number[])];
      await notify(
        tx,
        recipients,
        `Announcement "${existing.title}" has been resumed from hold.`,
        "info",
        `/announcements/${id}`,
      );
      await writeAudit(
        tx,
        auditCtx(req, "announcement.resume", "announcements", id, {
          before: { status: "on_hold" },
          after: { status: restored },
        }),
      );
    });

    markAudited(res);
    const fresh = await selectHydrated().where(eq(announcementsTable.id, id)).limit(1);
    res.json({ announcement: fresh[0] });
  }),
);

// ---------- Sub-components ----------

const addSubSchema = z.object({
  announcementId: z.number().int().positive(),
  title: z.string().trim().min(1).max(300).refine(hasAlphanumeric, {
    message: "Title must contain at least one letter or digit",
  }),
  description: z.string().default(""),
  assignedTo: z.number().int().positive().nullable().optional(),
  status: z.enum(subComponentStatuses).default("Pending"),
});

router.post(
  "/sub-components",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const data = addSubSchema.parse(req.body);
    const parent = await db
      .select({
        id: announcementsTable.id,
        title: announcementsTable.title,
        departmentId: announcementsTable.departmentId,
        workflowStatus: announcementsTable.workflowStatus,
        acceptedByDeptNodalId: announcementsTable.acceptedByDeptNodalId,
        createdBy: announcementsTable.createdBy,
      })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, data.announcementId))
      .limit(1);
    if (!parent[0]) throw new HttpError(404, "Announcement not found");
    // Sub-components may only be created once the Department Reviewer has
    // granted final acceptance (status `accepted` or later in the execution
    // chain). Before that, neither the CMO creator nor the accepting Dept
    // Nodal may pre-populate work items — the work plan is an artifact of
    // the officially-accepted Sankalpa.
    const allowedParentStatuses: WorkflowStatus[] = [
      "accepted",
      "in_progress",
      "reverted_by_dept_reviewer",
    ];
    if (!allowedParentStatuses.includes(parent[0].workflowStatus)) {
      throw new HttpError(
        409,
        "Sub-components can be added only after the Department Reviewer grants final acceptance",
      );
    }
    const isDeptNodalOwner = parent[0].acceptedByDeptNodalId === actor.id;
    const isAllowed = actor.role === "admin" || isDeptNodalOwner;
    if (!isAllowed) throw new HttpError(403, "Forbidden");

    let inserted: number;
    await db.transaction(async (tx) => {
      // Validate that the assignee (if provided) belongs to the same
      // department and holds a department-side executor role so that
      // sub-components cannot be steered to arbitrary accounts.
      if (data.assignedTo != null) {
        const targetUser = await tx
          .select({ departmentId: usersTable.departmentId, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, data.assignedTo))
          .limit(1);
        if (!targetUser[0]) throw new HttpError(400, "Assigned user not found");
        if (targetUser[0].departmentId !== parent[0].departmentId) {
          throw new HttpError(400, "Assignee must belong to the same department as the announcement");
        }
        const deptExecutorRoles = new Set(["dept_head", "dept_nodal", "dept_reviewer", "dept_user"]);
        if (!deptExecutorRoles.has(targetUser[0].role)) {
          throw new HttpError(400, "Assignee must be a department user");
        }
      }
      const [row] = await tx
        .insert(subComponentsTable)
        .values({
          announcementId: data.announcementId,
          title: data.title,
          description: data.description,
          assignedTo: data.assignedTo ?? null,
          status: data.status,
        })
        .returning({ id: subComponentsTable.id });
      inserted = row!.id;
      const assignedName = data.assignedTo
        ? (
            await tx
              .select({ name: usersTable.name })
              .from(usersTable)
              .where(eq(usersTable.id, data.assignedTo))
              .limit(1)
          )[0]?.name ?? null
        : null;
      const note = assignedName ? ` Assigned to ${assignedName}.` : "";
      await addComment(
        tx,
        data.announcementId,
        actor.id,
        "Sub-component Added",
        `Added sub-component "${data.title}".${note}`,
      );
      if (data.assignedTo) {
        await notify(
          tx,
          [data.assignedTo],
          `You have been tagged on sub-component "${data.title}" of "${parent[0]!.title}".`,
          "info",
          `/announcements/${data.announcementId}`,
        );
      }
      await writeAudit(
        tx,
        auditCtx(req, "subcomponent.create", "subcomponents", inserted!, {
          after: {
            announcementId: data.announcementId,
            title: data.title,
            assignedTo: data.assignedTo ?? null,
            status: data.status,
          },
        }),
      );
    });
    markAudited(res);
    res.status(201).json({ id: inserted! });
  }),
);

const patchSubSchema = z.object({
  assignedTo: z.number().int().positive().nullable().optional(),
  status: z.enum(subComponentStatuses).optional(),
});

router.patch(
  "/sub-components/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = patchSubSchema.parse(req.body);
    if (data.assignedTo === undefined && data.status === undefined) {
      throw new HttpError(400, "Nothing to update");
    }
    await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(subComponentsTable)
        .where(eq(subComponentsTable.id, id))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw new HttpError(404, "Sub-component not found");
      const parent = await loadForUpdate(tx, existing.announcementId);

      if (data.assignedTo !== undefined) {
        // The CMO creator may reassign only while the announcement is still
        // pending_dept_acceptance.  After department execution starts, only
        // the accepting Dept Nodal (or admin) controls task ownership.
        const isCreatorRetagging =
          parent.createdBy === actor.id &&
          parent.workflowStatus === "pending_dept_acceptance";
        const isDeptNodalOwner = parent.acceptedByDeptNodalId === actor.id;
        const allowed =
          actor.role === "admin" || isCreatorRetagging || isDeptNodalOwner;
        if (!allowed) throw new HttpError(403, "Forbidden");

        // When assigning to a user, validate they belong to the same department
        // and hold a department executor role so that sub-component progress
        // cannot be delegated to out-of-scope accounts.
        if (data.assignedTo !== null) {
          const targetUser = await tx
            .select({ departmentId: usersTable.departmentId, role: usersTable.role })
            .from(usersTable)
            .where(eq(usersTable.id, data.assignedTo))
            .limit(1);
          if (!targetUser[0]) throw new HttpError(400, "Assigned user not found");
          if (targetUser[0].departmentId !== parent.departmentId) {
            throw new HttpError(400, "Assignee must belong to the same department as the announcement");
          }
          const deptExecutorRoles = new Set(["dept_head", "dept_nodal", "dept_reviewer", "dept_user"]);
          if (!deptExecutorRoles.has(targetUser[0].role)) {
            throw new HttpError(400, "Assignee must be a department user");
          }
        }

        await tx
          .update(subComponentsTable)
          .set({ assignedTo: data.assignedTo, updatedAt: new Date() })
          .where(eq(subComponentsTable.id, id));
        const ownerName = data.assignedTo
          ? (
              await tx
                .select({ name: usersTable.name })
                .from(usersTable)
                .where(eq(usersTable.id, data.assignedTo))
                .limit(1)
            )[0]?.name ?? "Unassigned"
          : "Unassigned";
        await addComment(
          tx,
          existing.announcementId,
          actor.id,
          "Sub-component Reassigned",
          `Sub-component "${existing.title}" assigned to ${ownerName}.`,
        );
        if (data.assignedTo && data.assignedTo !== existing.assignedTo) {
          await notify(
            tx,
            [data.assignedTo],
            `You have been tagged on sub-component "${existing.title}" of "${parent.title}".`,
            "info",
            `/announcements/${existing.announcementId}`,
          );
        }
      }

      if (data.status !== undefined) {
        // Viewer roles are read-only and may never mutate sub-component state.
        if (actor.role === "dept_viewer") {
          throw new HttpError(403, "Viewer roles cannot update sub-component status");
        }
        // Sub-component progress is only allowed once the Department Nodal has
        // officially started progress (status `in_progress`).  The `accepted`
        // state is the setup window where the Nodal creates and assigns
        // sub-components; execution may not begin until Start Progress is
        // triggered.  Work may also continue after a completion revert.
        const executionStatuses: WorkflowStatus[] = ["in_progress", "reverted_by_dept_reviewer"];
        if (actor.role !== "admin" && !executionStatuses.includes(parent.workflowStatus)) {
          throw new HttpError(
            403,
            "Sub-component status cannot be changed before the Department Nodal starts progress",
          );
        }
        // Only the assignee or admin can change status.
        if (actor.role !== "admin" && existing.assignedTo !== actor.id) {
          throw new HttpError(403, "Only the assignee can update status");
        }
        // The actor must belong to the announcement's department.  This prevents
        // a CMO-side or cross-department account that was improperly assigned
        // from advancing sub-component state across trust boundaries.
        if (actor.role !== "admin") {
          const actorUser = await tx
            .select({ departmentId: usersTable.departmentId })
            .from(usersTable)
            .where(eq(usersTable.id, actor.id))
            .limit(1);
          if (!actorUser[0] || actorUser[0].departmentId !== parent.departmentId) {
            throw new HttpError(403, "Status can only be updated by users in the responsible department");
          }
        }
        await tx
          .update(subComponentsTable)
          .set({ status: data.status, updatedAt: new Date() })
          .where(eq(subComponentsTable.id, id));
        const action =
          data.status === "Completed"
            ? "Sub-component Completed"
            : data.status === "In Progress"
              ? "Sub-component Started"
              : "Sub-component Updated";
        await addComment(
          tx,
          existing.announcementId,
          actor.id,
          action,
          `Sub-component "${existing.title}" marked as ${data.status}.`,
        );
        // If this was the final completion and parent has an accepting nodal,
        // notify them that they can now request closure.
        if (data.status === "Completed" && parent.acceptedByDeptNodalId) {
          const pastInProgress: WorkflowStatus[] = [
            "pending_completion_review",
            "reverted_by_dept_reviewer",
            "pending_cmo_completion_review",
            "completed",
          ];
          if (!pastInProgress.includes(parent.workflowStatus)) {
            const siblings = await tx
              .select({ id: subComponentsTable.id, status: subComponentsTable.status })
              .from(subComponentsTable)
              .where(eq(subComponentsTable.announcementId, existing.announcementId));
            const allDone = siblings.every((s) =>
              s.id === id ? true : s.status === "Completed",
            );
            if (allDone) {
              await notify(
                tx,
                [parent.acceptedByDeptNodalId],
                `All sub-components of "${parent.title}" are completed. You can now request closure.`,
                "success",
                `/announcements/${existing.announcementId}`,
              );
            }
          }
        }
      }
      await writeAudit(
        tx,
        auditCtx(req, "subcomponent.update", "subcomponents", id, {
          before: { assignedTo: existing.assignedTo, status: existing.status },
          after: {
            ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
          },
        }),
      );
    });
    markAudited(res);
    res.status(204).end();
  }),
);

// ---------- DELETE announcement (pre-publication only) ----------

router.delete(
  "/announcements/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);

    // Viewer-only roles can never delete announcements, even if they are
    // historical creators (e.g. role downgraded after creating the record).
    if (actor.role === "dept_viewer") {
      throw new HttpError(403, "Viewer roles cannot delete announcements");
    }

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: announcementsTable.id,
          title: announcementsTable.title,
          uniqueId: announcementsTable.uniqueId,
          workflowStatus: announcementsTable.workflowStatus,
          createdBy: announcementsTable.createdBy,
        })
        .from(announcementsTable)
        .where(eq(announcementsTable.id, id))
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new HttpError(404, "Not found");

      if (!PRE_PUBLICATION_STATUSES.has(existing.workflowStatus)) {
        throw new HttpError(
          409,
          "Only pre-publication announcements (draft / pending_cmo_review / reverted) can be deleted",
        );
      }
      if (existing.createdBy !== actor.id && actor.role !== "admin") {
        throw new HttpError(403, "Only the creator (or admin) can delete this announcement");
      }

      await writeAudit(
        tx,
        auditCtx(req, "announcement.delete", "announcements", id, {
          before: {
            id: existing.id,
            uniqueId: existing.uniqueId,
            title: existing.title,
            status: existing.workflowStatus,
          },
        }),
      );

      await tx.delete(announcementsTable).where(eq(announcementsTable.id, id));
    });

    markAudited(res);
    res.status(204).end();
  }),
);

// ---------- Sub-component remarks (Interim Updates) ----------

const addRemarkSchema = z.object({
  remark: z.string().trim().min(1).max(2000),
});

const VIEWER_ROLES = new Set(["dept_viewer"]);
// Interim updates (remarks) are only permitted once the Department Nodal has
// officially started progress.  The `accepted` state is the Nodal's setup
// window; execution begins — and remarks become meaningful — only after
// Start Progress is triggered.
const REMARK_ALLOWED_PARENT_STATUSES: WorkflowStatus[] = [
  "in_progress",
  "reverted_by_dept_reviewer",
];

async function loadSubForRemark(subId: number) {
  const rows = await db
    .select({
      id: subComponentsTable.id,
      announcementId: subComponentsTable.announcementId,
      title: subComponentsTable.title,
      assignedTo: subComponentsTable.assignedTo,
      status: subComponentsTable.status,
      parentTitle: announcementsTable.title,
      parentStatus: announcementsTable.workflowStatus,
      parentDepartmentId: announcementsTable.departmentId,
      acceptedByDeptNodalId: announcementsTable.acceptedByDeptNodalId,
    })
    .from(subComponentsTable)
    .innerJoin(
      announcementsTable,
      eq(announcementsTable.id, subComponentsTable.announcementId),
    )
    .where(eq(subComponentsTable.id, subId))
    .limit(1);
  return rows[0] ?? null;
}

router.get(
  "/sub-components/:id/remarks",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const sub = await loadSubForRemark(id);
    if (!sub) throw new HttpError(404, "Sub-component not found");
    // Mirror announcement visibility exactly — a user must be able to see
    // the parent announcement before reading its sub-component remarks.
    const visibility = await buildVisibilityClause(actor);
    const parentVisible = await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(
        visibility
          ? and(eq(announcementsTable.id, sub.announcementId), visibility)
          : eq(announcementsTable.id, sub.announcementId),
      )
      .limit(1);
    if (!parentVisible[0]) throw new HttpError(404, "Sub-component not found");
    const rows = await db
      .select({
        id: subComponentRemarksTable.id,
        subComponentId: subComponentRemarksTable.subComponentId,
        userId: subComponentRemarksTable.userId,
        userName: usersTable.name,
        role: usersTable.role,
        remark: subComponentRemarksTable.remark,
        createdAt: subComponentRemarksTable.createdAt,
      })
      .from(subComponentRemarksTable)
      .leftJoin(usersTable, eq(usersTable.id, subComponentRemarksTable.userId))
      .where(eq(subComponentRemarksTable.subComponentId, id))
      .orderBy(asc(subComponentRemarksTable.createdAt));
    res.json({ remarks: rows });
  }),
);

router.post(
  "/sub-components/:id/remarks",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const data = addRemarkSchema.parse(req.body);

    if (VIEWER_ROLES.has(actor.role)) {
      throw new HttpError(403, "Viewer roles cannot post remarks");
    }

    const sub = await loadSubForRemark(id);
    if (!sub) throw new HttpError(404, "Sub-component not found");

    if (!REMARK_ALLOWED_PARENT_STATUSES.includes(sub.parentStatus)) {
      throw new HttpError(
        409,
        "Interim updates can be posted only after the Department Nodal starts progress",
      );
    }
    if (sub.status === "Completed") {
      throw new HttpError(409, "Sub-component is already Completed");
    }
    const isAssignee = sub.assignedTo === actor.id;
    if (actor.role !== "admin" && !isAssignee) {
      throw new HttpError(403, "Only the tagged assignee can post interim updates");
    }

    let insertedId: number;
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(subComponentRemarksTable)
        .values({
          subComponentId: id,
          userId: actor.id,
          remark: data.remark,
        })
        .returning({ id: subComponentRemarksTable.id });
      insertedId = row!.id;

      await addComment(
        tx,
        sub.announcementId,
        actor.id,
        "Interim Update",
        `Update on sub-component "${sub.title}": ${data.remark}`,
      );

      if (
        sub.acceptedByDeptNodalId &&
        sub.acceptedByDeptNodalId !== actor.id
      ) {
        await notify(
          tx,
          [sub.acceptedByDeptNodalId],
          `Interim update posted on sub-component "${sub.title}" of "${sub.parentTitle}".`,
          "info",
          `/announcements/${sub.announcementId}`,
        );
      }

      await writeAudit(
        tx,
        auditCtx(req, "subcomponent.remark.create", "sub_component_remarks", insertedId!, {
          after: {
            subComponentId: id,
            announcementId: sub.announcementId,
            remark: data.remark,
          },
        }),
      );
    });

    markAudited(res);
    res.status(201).json({ id: insertedId! });
  }),
);

export default router;
