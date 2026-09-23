import { Router, type IRouter } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  departmentsTable,
  categoriesTable,
  tagsTable,
  districtsTable,
  blocksTable,
  occasionsTable,
} from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) });
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
}).refine((v) => v.name !== undefined || v.isActive !== undefined, {
  message: "At least one of `name` or `isActive` must be provided",
});

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

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23503";
}

/**
 * Hard-delete a master row. Returns 204 on success, 409 if a FK constraint
 * (i.e. live references) prevents the delete. Used by `POST /:id/hard-delete`
 * routes below to give admins a way to permanently remove a row only when
 * nothing references it; the normal `DELETE` verb is reserved for soft-disable.
 */
async function hardDeleteOrThrow<T extends { id: any }>(
  table: T,
  id: number,
  label: string,
): Promise<void> {
  try {
    const deleted = await db
      .delete(table as any)
      .where(eq((table as any).id, id))
      .returning({ id: (table as any).id });
    if (!deleted[0]) throw new HttpError(404, `${label} not found`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (isForeignKeyViolation(err)) {
      throw new HttpError(
        409,
        `Cannot hard-delete ${label.toLowerCase()}: it is still referenced. Use Disable instead.`,
      );
    }
    throw err;
  }
}

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

// ---------- Departments ----------

router.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
    res.json({ departments: rows });
  }),
);

router.post(
  "/departments",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const inserted = await db
      .insert(departmentsTable)
      .values({ name })
      .onConflictDoNothing({ target: departmentsTable.name })
      .returning();
    if (!inserted[0]) {
      const existing = await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.name, name))
        .limit(1);
      res.status(200).json({ department: existing[0] });
      return;
    }
    res.status(201).json({ department: inserted[0] });
  }),
);

router.patch(
  "/departments/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(departmentsTable)
        .set(updates)
        .where(eq(departmentsTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "Department not found");
      res.json({ department: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Department name already exists");
      }
      throw err;
    }
  }),
);

router.delete(
  "/departments/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(departmentsTable)
      .set({ isActive: false })
      .where(eq(departmentsTable.id, id))
      .returning({ id: departmentsTable.id });
    if (!updated[0]) throw new HttpError(404, "Department not found");
    res.status(204).end();
  }),
);

// ---------- Categories ----------

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
    res.json({ categories: rows });
  }),
);

router.post(
  "/categories",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const inserted = await db
      .insert(categoriesTable)
      .values({ name })
      .onConflictDoNothing({ target: categoriesTable.name })
      .returning();
    if (!inserted[0]) {
      const existing = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.name, name))
        .limit(1);
      res.status(200).json({ category: existing[0] });
      return;
    }
    res.status(201).json({ category: inserted[0] });
  }),
);

router.patch(
  "/categories/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(categoriesTable)
        .set(updates)
        .where(eq(categoriesTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "Category not found");
      res.json({ category: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Category name already exists");
      }
      throw err;
    }
  }),
);

router.delete(
  "/categories/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(categoriesTable)
      .set({ isActive: false })
      .where(eq(categoriesTable.id, id))
      .returning({ id: categoriesTable.id });
    if (!updated[0]) throw new HttpError(404, "Category not found");
    res.status(204).end();
  }),
);

// ---------- Tags ----------

router.get(
  "/tags",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(tagsTable).orderBy(tagsTable.name);
    res.json({ tags: rows });
  }),
);

router.post(
  "/tags",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const inserted = await db
      .insert(tagsTable)
      .values({ name })
      .onConflictDoNothing({ target: tagsTable.name })
      .returning();
    if (!inserted[0]) {
      const existing = await db
        .select()
        .from(tagsTable)
        .where(eq(tagsTable.name, name))
        .limit(1);
      res.status(200).json({ tag: existing[0] });
      return;
    }
    res.status(201).json({ tag: inserted[0] });
  }),
);

router.patch(
  "/tags/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(tagsTable)
        .set(updates)
        .where(eq(tagsTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "Tag not found");
      res.json({ tag: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Tag name already exists");
      }
      throw err;
    }
  }),
);

router.delete(
  "/tags/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(tagsTable)
      .set({ isActive: false })
      .where(eq(tagsTable.id, id))
      .returning({ id: tagsTable.id });
    if (!updated[0]) throw new HttpError(404, "Tag not found");
    res.status(204).end();
  }),
);

// ---------- Districts ----------

router.get(
  "/districts",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(districtsTable).orderBy(districtsTable.name);
    res.json({ districts: rows });
  }),
);

router.post(
  "/districts",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const inserted = await db
      .insert(districtsTable)
      .values({ name })
      .onConflictDoNothing({ target: districtsTable.name })
      .returning();
    if (!inserted[0]) {
      const existing = await db
        .select()
        .from(districtsTable)
        .where(eq(districtsTable.name, name))
        .limit(1);
      res.status(200).json({ district: existing[0] });
      return;
    }
    res.status(201).json({ district: inserted[0] });
  }),
);

router.patch(
  "/districts/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(districtsTable)
        .set(updates)
        .where(eq(districtsTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "District not found");
      res.json({ district: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "District name already exists");
      }
      throw err;
    }
  }),
);

router.delete(
  "/districts/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(districtsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(districtsTable.id, id))
      .returning({ id: districtsTable.id });
    if (!updated[0]) throw new HttpError(404, "District not found");
    res.status(204).end();
  }),
);

// ---------- Blocks ----------

const blockCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  districtId: z.number().int().positive(),
});

router.get(
  "/blocks",
  asyncHandler(async (req, res) => {
    const districtIdRaw = req.query.districtId;
    let rows;
    if (districtIdRaw !== undefined) {
      const districtId = parseId(districtIdRaw);
      rows = await db
        .select()
        .from(blocksTable)
        .where(eq(blocksTable.districtId, districtId))
        .orderBy(blocksTable.name);
    } else {
      rows = await db.select().from(blocksTable).orderBy(blocksTable.name);
    }
    res.json({ blocks: rows });
  }),
);

router.post(
  "/blocks",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, districtId } = blockCreateSchema.parse(req.body);
    // Ensure district exists for a meaningful error rather than relying on FK 23503.
    const district = await db
      .select({ id: districtsTable.id })
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .limit(1);
    if (!district[0]) throw new HttpError(400, "District not found");
    try {
      const inserted = await db
        .insert(blocksTable)
        .values({ name, districtId })
        .onConflictDoNothing({ target: [blocksTable.districtId, blocksTable.name] })
        .returning();
      if (!inserted[0]) {
        const existing = await db
          .select()
          .from(blocksTable)
          .where(and(eq(blocksTable.districtId, districtId), eq(blocksTable.name, name)))
          .limit(1);
        res.status(200).json({ block: existing[0] });
        return;
      }
      res.status(201).json({ block: inserted[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Block already exists for this district");
      }
      throw err;
    }
  }),
);

router.patch(
  "/blocks/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(blocksTable)
        .set(updates)
        .where(eq(blocksTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "Block not found");
      res.json({ block: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Block name already exists in this district");
      }
      throw err;
    }
  }),
);

router.delete(
  "/blocks/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(blocksTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(blocksTable.id, id))
      .returning({ id: blocksTable.id });
    if (!updated[0]) throw new HttpError(404, "Block not found");
    res.status(204).end();
  }),
);

// ---------- Occasions ----------

router.get(
  "/occasions",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(occasionsTable).orderBy(occasionsTable.name);
    res.json({ occasions: rows });
  }),
);

router.post(
  "/occasions",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    const inserted = await db
      .insert(occasionsTable)
      .values({ name })
      .onConflictDoNothing({ target: occasionsTable.name })
      .returning();
    if (!inserted[0]) {
      const existing = await db
        .select()
        .from(occasionsTable)
        .where(eq(occasionsTable.name, name))
        .limit(1);
      res.status(200).json({ occasion: existing[0] });
      return;
    }
    res.status(201).json({ occasion: inserted[0] });
  }),
);

router.patch(
  "/occasions/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const patch = patchSchema.parse(req.body);
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    try {
      const updated = await db
        .update(occasionsTable)
        .set(updates)
        .where(eq(occasionsTable.id, id))
        .returning();
      if (!updated[0]) throw new HttpError(404, "Occasion not found");
      res.json({ occasion: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "Occasion name already exists");
      }
      throw err;
    }
  }),
);

router.delete(
  "/occasions/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const updated = await db
      .update(occasionsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(occasionsTable.id, id))
      .returning({ id: occasionsTable.id });
    if (!updated[0]) throw new HttpError(404, "Occasion not found");
    res.status(204).end();
  }),
);

// ---------- Admin review: unknown typed occasions ----------
//
// Returns distinct `occasion` strings used on announcements or UOI notes that
// are NOT present in the occasions master (case-sensitive match, since the
// master is itself case-sensitive). Powers the "pending review" banner on the
// Masters → Occasions tab so admins can promote ad-hoc typed values in one
// click. Admin-only because the data exposes user-typed values across all
// records.
router.get(
  "/occasions/unknown",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const [annRows, uoiRows, masterRows] = await Promise.all([
      db.execute(sql`SELECT DISTINCT occasion AS name FROM announcements WHERE occasion IS NOT NULL AND occasion <> ''`),
      db.execute(sql`SELECT DISTINCT occasion AS name FROM uoi_notes WHERE occasion IS NOT NULL AND occasion <> ''`),
      db.select({ name: occasionsTable.name }).from(occasionsTable),
    ]);
    const known = new Set(masterRows.map((r) => r.name));
    const seen = new Set<string>();
    const unknown: string[] = [];
    const collect = (rows: { rows: Array<Record<string, unknown>> } | Array<Record<string, unknown>>) => {
      const list = Array.isArray(rows) ? rows : rows.rows;
      for (const r of list) {
        const name = String(r["name"] ?? "").trim();
        if (!name || known.has(name) || seen.has(name)) continue;
        seen.add(name);
        unknown.push(name);
      }
    };
    collect(annRows as any);
    collect(uoiRows as any);
    unknown.sort((a, b) => a.localeCompare(b));
    res.json({ unknown });
  }),
);

// ---------- Guarded hard-delete (admin only, fails if referenced) ----------

router.post("/departments/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(departmentsTable, parseId(req.params.id), "Department");
  res.status(204).end();
}));
router.post("/categories/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(categoriesTable, parseId(req.params.id), "Category");
  res.status(204).end();
}));
router.post("/tags/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(tagsTable, parseId(req.params.id), "Tag");
  res.status(204).end();
}));
router.post("/districts/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(districtsTable, parseId(req.params.id), "District");
  res.status(204).end();
}));
router.post("/blocks/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(blocksTable, parseId(req.params.id), "Block");
  res.status(204).end();
}));
router.post("/occasions/:id/hard-delete", requireRole("admin"), asyncHandler(async (req, res) => {
  await hardDeleteOrThrow(occasionsTable, parseId(req.params.id), "Occasion");
  res.status(204).end();
}));

export default router;
