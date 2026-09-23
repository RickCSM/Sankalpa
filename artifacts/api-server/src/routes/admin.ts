import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  announcementsTable,
  announcementCommentsTable,
  announcementAttachmentsTable,
  subComponentsTable,
  notificationsTable,
  auditLogTable,
  assignmentPointersTable,
} from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import { markAudited } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

router.post(
  "/admin/factory-reset",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    if (actor.role !== "admin") {
      throw new HttpError(403, "Forbidden — admin role required");
    }

    const cleared: Record<string, number> = {};

    await db.transaction(async (tx) => {
      // Delete in FK-safe order: children before parents so cascades don't
      // interfere with our row counts.
      const attachments = await tx
        .delete(announcementAttachmentsTable)
        .returning({ id: announcementAttachmentsTable.id });
      cleared.attachments = attachments.length;

      const comments = await tx
        .delete(announcementCommentsTable)
        .returning({ id: announcementCommentsTable.id });
      cleared.comments = comments.length;

      const subs = await tx
        .delete(subComponentsTable)
        .returning({ id: subComponentsTable.id });
      cleared.subComponents = subs.length;

      const notifs = await tx
        .delete(notificationsTable)
        .returning({ id: notificationsTable.id });
      cleared.notifications = notifs.length;

      const anns = await tx
        .delete(announcementsTable)
        .returning({ id: announcementsTable.id });
      cleared.announcements = anns.length;

      const audits = await tx
        .delete(auditLogTable)
        .returning({ id: auditLogTable.id });
      cleared.auditLog = audits.length;

      // Reset only the CMO round-robin pointer so unrelated future pointers
      // are unaffected.
      await tx
        .update(assignmentPointersTable)
        .set({ value: 0, updatedAt: new Date() })
        .where(eq(assignmentPointersTable.key, "cmo_reviewer"));
    });

    // Suppress the global auditMiddleware so no new row is inserted after the
    // response — the audit_log was just wiped and must stay empty.
    markAudited(res);
    res.json({ cleared });
  }),
);

export default router;
