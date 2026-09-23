import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, ilike, and, count, desc, sql } from "drizzle-orm";
import {
  db,
  uoiNotesTable,
  departmentsTable,
} from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import type { UserRole } from "@workspace/db";

const router: IRouter = Router();

router.use(requireAuth);

const UOI_NOTES_WRITE_ROLES: UserRole[] = ["admin", "chief_minister", "cmo_nodal", "cmo_reviewer", "ocac_viewer"];
const UOI_NOTES_READ_ROLES: UserRole[] = [...UOI_NOTES_WRITE_ROLES];

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(500),
  date: z.string().trim().min(1),
  departmentId: z.number().int().positive(),
  occasion: z.string().trim().optional(),
  location: z.string().trim().optional(),
  description: z.string().trim().min(1),
});

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

// GET /api/uoi-notes
router.get(
  "/uoi-notes",
  asyncHandler(async (req, res) => {
    const role = req.session?.user?.role as UserRole | undefined;
    if (!role || !UOI_NOTES_READ_ROLES.includes(role)) {
      throw new HttpError(403, "Access denied");
    }

    const page = Math.max(1, Number(req.query["page"]) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query["pageSize"]) || 20));
    const fetchAll = req.query["all"] === "true" || req.query["all"] === "1";
    const departmentId = req.query["departmentId"] ? Number(req.query["departmentId"]) : undefined;
    const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : undefined;

    const conditions = [];
    if (departmentId && Number.isInteger(departmentId) && departmentId > 0) {
      conditions.push(eq(uoiNotesTable.departmentId, departmentId));
    }
    if (search) {
      conditions.push(ilike(uoiNotesTable.title, `%${search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        id: uoiNotesTable.id,
        title: uoiNotesTable.title,
        date: uoiNotesTable.date,
        departmentId: uoiNotesTable.departmentId,
        departmentName: departmentsTable.name,
        occasion: uoiNotesTable.occasion,
        location: uoiNotesTable.location,
        description: uoiNotesTable.description,
        createdBy: uoiNotesTable.createdBy,
        createdAt: uoiNotesTable.createdAt,
      })
      .from(uoiNotesTable)
      .innerJoin(departmentsTable, eq(uoiNotesTable.departmentId, departmentsTable.id))
      .where(where)
      .orderBy(desc(uoiNotesTable.createdAt))
      .$dynamic();

    const [rows, [{ total }]] = await Promise.all([
      fetchAll ? baseQuery : baseQuery.limit(pageSize).offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(uoiNotesTable)
        .where(where),
    ]);

    res.json({
      notes: rows,
      total: Number(total),
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Number(total) : pageSize,
    });
  }),
);

// GET /api/uoi-notes/report — aggregate insights across all UOI notes
router.get(
  "/uoi-notes/report",
  asyncHandler(async (req, res) => {
    const role = req.session?.user?.role as UserRole | undefined;
    if (!role || !UOI_NOTES_READ_ROLES.includes(role)) {
      throw new HttpError(403, "Access denied");
    }

    const occasionSet = sql`${uoiNotesTable.occasion} IS NOT NULL AND TRIM(${uoiNotesTable.occasion}) <> ''`;
    const locationSet = sql`${uoiNotesTable.location} IS NOT NULL AND TRIM(${uoiNotesTable.location}) <> ''`;
    const monthExpr = sql<string>`to_char(${uoiNotesTable.createdAt}, 'YYYY-MM')`;

    const [
      [kpiRow],
      byDepartment,
      byOccasion,
      byLocation,
      byMonth,
      notes,
    ] = await Promise.all([
      db
        .select({
          totalNotes: count(),
          recentCount: sql<number>`count(*) FILTER (WHERE ${uoiNotesTable.createdAt} >= now() - interval '30 days')`,
          firstNoteDate: sql<string | null>`min(${uoiNotesTable.createdAt})`,
          lastNoteDate: sql<string | null>`max(${uoiNotesTable.createdAt})`,
        })
        .from(uoiNotesTable),
      db
        .select({ name: departmentsTable.name, count: count() })
        .from(uoiNotesTable)
        .innerJoin(departmentsTable, eq(uoiNotesTable.departmentId, departmentsTable.id))
        .groupBy(departmentsTable.name)
        .orderBy(desc(count()), departmentsTable.name),
      db
        .select({ name: uoiNotesTable.occasion, count: count() })
        .from(uoiNotesTable)
        .where(occasionSet)
        .groupBy(uoiNotesTable.occasion)
        .orderBy(desc(count()), uoiNotesTable.occasion),
      db
        .select({ name: uoiNotesTable.location, count: count() })
        .from(uoiNotesTable)
        .where(locationSet)
        .groupBy(uoiNotesTable.location)
        .orderBy(desc(count()), uoiNotesTable.location),
      db
        .select({ month: monthExpr, count: count() })
        .from(uoiNotesTable)
        .groupBy(monthExpr)
        .orderBy(monthExpr),
      db
        .select({
          id: uoiNotesTable.id,
          title: uoiNotesTable.title,
          date: uoiNotesTable.date,
          departmentId: uoiNotesTable.departmentId,
          departmentName: departmentsTable.name,
          occasion: uoiNotesTable.occasion,
          location: uoiNotesTable.location,
          description: uoiNotesTable.description,
          createdBy: uoiNotesTable.createdBy,
          createdAt: uoiNotesTable.createdAt,
        })
        .from(uoiNotesTable)
        .innerJoin(departmentsTable, eq(uoiNotesTable.departmentId, departmentsTable.id))
        .orderBy(desc(uoiNotesTable.createdAt)),
    ]);

    const normalize = (rows: { name: string | null; count: number }[]) =>
      rows.map((r) => ({ name: r.name ?? "", count: Number(r.count) }));

    res.json({
      kpis: {
        totalNotes: Number(kpiRow?.totalNotes ?? 0),
        departmentsCovered: byDepartment.length,
        occasionsCount: byOccasion.length,
        locationsCount: byLocation.length,
        recentCount: Number(kpiRow?.recentCount ?? 0),
        firstNoteDate: kpiRow?.firstNoteDate
          ? new Date(kpiRow.firstNoteDate).toISOString()
          : null,
        lastNoteDate: kpiRow?.lastNoteDate
          ? new Date(kpiRow.lastNoteDate).toISOString()
          : null,
      },
      byDepartment: normalize(byDepartment),
      byOccasion: normalize(byOccasion),
      byLocation: normalize(byLocation),
      byMonth: byMonth.map((r) => ({ month: r.month, count: Number(r.count) })),
      notes: notes.map((n) => ({
        ...n,
        createdAt:
          n.createdAt instanceof Date
            ? n.createdAt.toISOString()
            : new Date(n.createdAt).toISOString(),
      })),
    });
  }),
);

// POST /api/uoi-notes
router.post(
  "/uoi-notes",
  asyncHandler(async (req, res) => {
    const role = req.session?.user?.role as UserRole | undefined;
    if (!role || !UOI_NOTES_WRITE_ROLES.includes(role)) {
      throw new HttpError(403, "Access denied");
    }

    const body = createNoteSchema.parse(req.body);
    const createdBy = req.session!.user!.id;

    const dept = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, body.departmentId))
      .limit(1);
    if (!dept[0]) throw new HttpError(400, "Department not found");

    const [inserted] = await db
      .insert(uoiNotesTable)
      .values({
        title: body.title,
        date: body.date,
        departmentId: body.departmentId,
        occasion: body.occasion ?? null,
        location: body.location ?? null,
        description: body.description,
        createdBy,
      })
      .returning();

    const deptRow = await db
      .select({ name: departmentsTable.name })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, inserted!.departmentId))
      .limit(1);

    res.status(201).json({
      note: {
        ...inserted,
        departmentName: deptRow[0]?.name ?? "",
      },
    });
  }),
);

// PUT /api/uoi-notes/:id — creator or admin only
router.put(
  "/uoi-notes/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session!.user!;
    const role = actor.role as UserRole | undefined;
    if (!role || !UOI_NOTES_WRITE_ROLES.includes(role)) {
      throw new HttpError(403, "Access denied");
    }

    const id = parseId(req.params["id"]);
    const body = createNoteSchema.parse(req.body);

    const existing = await db
      .select({ id: uoiNotesTable.id, createdBy: uoiNotesTable.createdBy })
      .from(uoiNotesTable)
      .where(eq(uoiNotesTable.id, id))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "UOI note not found");

    if (actor.role !== "admin" && existing[0].createdBy !== actor.id) {
      throw new HttpError(403, "You can only edit notes you created");
    }

    const dept = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, body.departmentId))
      .limit(1);
    if (!dept[0]) throw new HttpError(400, "Department not found");

    const [updated] = await db
      .update(uoiNotesTable)
      .set({
        title: body.title,
        date: body.date,
        departmentId: body.departmentId,
        occasion: body.occasion ?? null,
        location: body.location ?? null,
        description: body.description,
      })
      .where(eq(uoiNotesTable.id, id))
      .returning();

    const deptRow = await db
      .select({ name: departmentsTable.name })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, updated!.departmentId))
      .limit(1);

    res.json({
      note: {
        ...updated,
        departmentName: deptRow[0]?.name ?? "",
      },
    });
  }),
);

// DELETE /api/uoi-notes/:id — creator or admin only
router.delete(
  "/uoi-notes/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session!.user!;
    const role = actor.role as UserRole | undefined;
    if (!role || !UOI_NOTES_WRITE_ROLES.includes(role)) {
      throw new HttpError(403, "Access denied");
    }

    const id = parseId(req.params["id"]);

    const existing = await db
      .select({ id: uoiNotesTable.id, createdBy: uoiNotesTable.createdBy })
      .from(uoiNotesTable)
      .where(eq(uoiNotesTable.id, id))
      .limit(1);
    if (!existing[0]) throw new HttpError(404, "UOI note not found");

    if (actor.role !== "admin" && existing[0].createdBy !== actor.id) {
      throw new HttpError(403, "You can only delete notes you created");
    }

    await db.delete(uoiNotesTable).where(eq(uoiNotesTable.id, id));
    res.status(204).end();
  }),
);

export default router;
