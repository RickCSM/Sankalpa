import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const unreadOnly =
      String(req.query.unreadOnly ?? "") === "1" || String(req.query.unreadOnly ?? "") === "true";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;
    const where = unreadOnly
      ? and(eq(notificationsTable.userId, actor.id), eq(notificationsTable.read, false))
      : eq(notificationsTable.userId, actor.id);

    const totalRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(notificationsTable)
      .where(where);
    const total = totalRows[0]?.c ?? 0;

    const unreadRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, actor.id), eq(notificationsTable.read, false)));
    const unreadCount = unreadRows[0]?.c ?? 0;

    const rows = await db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.id))
      .limit(pageSize)
      .offset(offset);
    res.json({ notifications: rows, total, page, pageSize, unreadCount });
  }),
);

router.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, actor.id)));
    res.status(204).end();
  }),
);

const markAllSchema = z.object({}).optional();

router.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    markAllSchema.parse(req.body);
    const actor = req.session.user!;
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.userId, actor.id), eq(notificationsTable.read, false)));
    res.status(204).end();
  }),
);

export default router;
