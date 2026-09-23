import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, announcementAttachmentsTable, announcementsTable } from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { buildVisibilityClause, selectHydrated, PRE_PUBLICATION_STATUSES } from "../lib/workflow";
import { verifyUploadToken } from "../lib/uploadToken";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.use(requireAuth);

export async function assertCanViewAnnouncement(actor: NonNullable<Request["session"]["user"]>, id: number): Promise<void> {
  const where = await buildVisibilityClause(actor);
  const rows = await (where
    ? selectHydrated().where(and(eq(announcementsTable.id, id), where))
    : selectHydrated().where(eq(announcementsTable.id, id))
  ).limit(1);
  if (!rows[0]) throw new HttpError(404, "Announcement not found");
}

/**
 * Asserts that the actor is permitted to attach files to the given
 * announcement.  Visibility alone is not sufficient: attaching a file
 * modifies the official workflow record, so we enforce ownership +
 * a workflow-state gate:
 *
 *   - admin         → always allowed
 *   - cmo_nodal     → only the original creator AND only while the
 *                     announcement is still pre-publication
 *   - dept_nodal    → only the Dept Nodal who accepted the announcement
 *
 * This prevents a cmo_nodal from planting files on a colleague's workflow
 * item, prevents them from mutating the record once it has been published,
 * and prevents a dept_nodal from tampering with another department's
 * announcement.
 */
export async function assertCanAttachToAnnouncement(
  actor: NonNullable<Request["session"]["user"]>,
  id: number,
): Promise<void> {
  if (actor.role === "admin") return;

  const rows = await db
    .select({
      createdBy: announcementsTable.createdBy,
      acceptedByDeptNodalId: announcementsTable.acceptedByDeptNodalId,
      workflowStatus: announcementsTable.workflowStatus,
    })
    .from(announcementsTable)
    .where(eq(announcementsTable.id, id))
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "Announcement not found");

  const row = rows[0];
  if (actor.role === "cmo_nodal") {
    if (row.createdBy !== actor.id) {
      throw new HttpError(403, "Only the original creator can attach files to this announcement");
    }
    if (!PRE_PUBLICATION_STATUSES.has(row.workflowStatus)) {
      throw new HttpError(
        403,
        "CMO Nodal cannot modify attachments after the announcement has been published",
      );
    }
    return;
  }
  if (actor.role === "dept_nodal") {
    if (row.acceptedByDeptNodalId !== actor.id) {
      throw new HttpError(403, "Only the accepting Department Nodal can attach files to this announcement");
    }
    return;
  }
  throw new HttpError(403, "Forbidden");
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const registerSchema = z.object({
  objectPath: z.string().min(1),
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().min(1).max(200).refine(
    (ct) => ALLOWED_ATTACHMENT_TYPES.has(ct),
    { message: "File type not allowed. Only PDF, JPEG, and PNG are accepted." }
  ),
  // Required: server-issued HMAC token from POST /storage/uploads/request-url.
  // Binds the registration to the actor that requested the upload URL and
  // the exact objectPath, preventing registration of arbitrary or hijacked
  // objects.
  uploadToken: z.string().min(1),
});

router.get(
  "/announcements/:id/attachments",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    await assertCanViewAnnouncement(actor, id);
    const rows = await db
      .select()
      .from(announcementAttachmentsTable)
      .where(eq(announcementAttachmentsTable.announcementId, id));
    res.json({ attachments: rows });
  }),
);

// Roles permitted to upload attachments to an announcement.
// Visibility alone is NOT sufficient — read-only viewers (chief_minister,
// cmo_reviewer, dept_head, dept_user) must not be able to add files.
export const ATTACHMENT_WRITE_ROLES = new Set([
  "admin",
  "cmo_nodal", // owner / creator
  "dept_nodal", // assigned department workflow owner
]);

router.post(
  "/announcements/:id/attachments",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    if (!ATTACHMENT_WRITE_ROLES.has(actor.role)) throw new HttpError(403, "Forbidden");
    await assertCanAttachToAnnouncement(actor, id);
    const data = registerSchema.parse(req.body);
    const normalized = data.objectPath.startsWith("/objects/")
      ? data.objectPath
      : objectStorage.normalizeObjectEntityPath(data.objectPath);
    // Verify the uploadToken binds {actor, announcementId, objectPath} so a
    // user cannot register a file someone else uploaded, against an
    // announcement other than the one they requested the URL for.
    const verdict = verifyUploadToken(data.uploadToken, actor.id, id, normalized);
    if (!verdict.ok) {
      throw new HttpError(403, verdict.reason);
    }
    // Replay protection: refuse to register the same object twice. Each
    // upload-URL request returns a fresh UUID, so a duplicate objectPath
    // means the token has already been consumed.
    const existing = await db
      .select({ id: announcementAttachmentsTable.id })
      .from(announcementAttachmentsTable)
      .where(eq(announcementAttachmentsTable.objectPath, normalized))
      .limit(1);
    if (existing[0]) {
      throw new HttpError(409, "Upload token already consumed");
    }
    // Verify the object actually exists in storage and validate its real
    // metadata. We cannot trust client-supplied contentType / fileSize because
    // the presigned PUT URL does not bind those fields — the browser uploads
    // directly to GCS and can send any payload it likes. Fetching the stored
    // object's metadata here is the only reliable enforcement point.
    const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
    let realContentType: string | null;
    let realSize: number | null;
    try {
      ({ contentType: realContentType, size: realSize } =
        await objectStorage.getObjectEntityRealMetadata(normalized));
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        throw new HttpError(400, "Uploaded object not found in storage");
      }
      throw err;
    }
    if (!realContentType || !ALLOWED_ATTACHMENT_TYPES.has(realContentType)) {
      throw new HttpError(400, "File type not allowed. Only PDF, JPEG, and PNG are accepted.");
    }
    if (realSize == null || realSize > MAX_ATTACHMENT_BYTES) {
      throw new HttpError(400, "File exceeds maximum allowed size of 10 MB.");
    }
    // Per-announcement duplicate guard: if a file with the same name AND
    // the same *trusted* byte length is already attached to this
    // announcement, reject. This catches the "user re-uploaded the same
    // document" case — each upload gets a fresh objectPath UUID so the
    // objectPath check above does not see it.
    //
    // Critically, this runs AFTER the storage metadata fetch and matches
    // against `realSize` (not the client-supplied `data.fileSize`), so a
    // caller cannot bypass the guard by lying about the size in the
    // registration body. The filename comparison is case-insensitive so
    // "Report.pdf" and "report.pdf" are treated as the same document.
    const duplicate = await db
      .select({ id: announcementAttachmentsTable.id })
      .from(announcementAttachmentsTable)
      .where(
        and(
          eq(announcementAttachmentsTable.announcementId, id),
          sql`lower(${announcementAttachmentsTable.fileName}) = lower(${data.fileName})`,
          eq(announcementAttachmentsTable.fileSize, realSize),
        ),
      )
      .limit(1);
    if (duplicate[0]) {
      throw new HttpError(
        409,
        "A file with the same name and size is already attached to this announcement",
      );
    }
    // Atomic replay defense: the unique index on object_path turns any
    // concurrent second insert into a Postgres unique-violation (SQLSTATE
    // 23505), which we surface as the same 409 the pre-check returns.
    let row;
    try {
      // Store the real GCS-verified values (realContentType, realSize), not
      // the client-supplied ones, so the DB record is always authoritative.
      [row] = await db
        .insert(announcementAttachmentsTable)
        .values({
          announcementId: id,
          objectPath: normalized,
          fileName: data.fileName,
          fileSize: realSize,
          contentType: realContentType,
          uploadedBy: actor.id,
        })
        .returning();
    } catch (err: unknown) {
      // drizzle wraps the pg error in _DrizzleQueryError; the real driver
      // error (with SQLSTATE on `.code`) is on `.cause`.
      const e = err as { code?: string; cause?: { code?: string } } | undefined;
      const code = e?.code ?? e?.cause?.code;
      if (code === "23505") {
        throw new HttpError(409, "Upload token already consumed");
      }
      throw err;
    }
    res.status(201).json({ attachment: row });
  }),
);

router.delete(
  "/attachments/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
    const [row] = await db
      .select()
      .from(announcementAttachmentsTable)
      .where(eq(announcementAttachmentsTable.id, id))
      .limit(1);
    if (!row) throw new HttpError(404, "Not found");
    // Load the parent announcement so we can apply workflow-state gates.
    const [ann] = await db
      .select({ workflowStatus: announcementsTable.workflowStatus })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, row.announcementId))
      .limit(1);
    if (!ann) throw new HttpError(404, "Not found");
    // The completed record is closed — no one mutates its attachments,
    // including admins, so the closure stays a true read-only history.
    if (ann.workflowStatus === "completed") {
      throw new HttpError(
        403,
        "Attachments cannot be deleted from a completed announcement",
      );
    }
    // CMO Nodal loses attachment-mutation rights once the announcement
    // has been published, regardless of whether they uploaded the file.
    if (actor.role === "cmo_nodal" && !PRE_PUBLICATION_STATUSES.has(ann.workflowStatus)) {
      throw new HttpError(
        403,
        "CMO Nodal cannot delete attachments after the announcement has been published",
      );
    }
    // Uploader or admin may delete. (Audit trail is preserved via the global
    // post-response audit middleware on this DELETE; the row itself records
    // who deleted what.)
    if (row.uploadedBy !== actor.id && actor.role !== "admin") {
      throw new HttpError(403, "Forbidden");
    }
    await db.delete(announcementAttachmentsTable).where(eq(announcementAttachmentsTable.id, id));
    res.status(204).end();
  }),
);

/**
 * Stream a private object after re-checking that the requester can view the
 * parent announcement. The objectPath comes from `/api/storage/objects/<rest>`.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response, next) => {
  try {
    const actor = req.session.user;
    if (!actor) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const att = await db
      .select()
      .from(announcementAttachmentsTable)
      .where(eq(announcementAttachmentsTable.objectPath, objectPath))
      .limit(1);
    if (!att[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await assertCanViewAnnouncement(actor, att[0].announcementId);
    const download = req.query.download === "1" || req.query.download === "true";
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file, {
      download,
      fileName: att[0].fileName,
    });
    res.status(response.status);
    // Override Content-Type and Content-Length with the sanitized, GCS-verified
    // values stored in the DB at registration time. This prevents a smuggled
    // object (uploaded with a different MIME type than declared) from being
    // served under its real — potentially forbidden — content type.
    // Content-Disposition (set by downloadObject from the original filename) is
    // forwarded as-is so downloads keep their name and viewing stays inline.
    response.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (lk !== "content-type" && lk !== "content-length") {
        res.setHeader(key, value);
      }
    });
    res.setHeader("Content-Type", att[0].contentType);
    if (att[0].fileSize != null) {
      res.setHeader("Content-Length", String(att[0].fileSize));
    }
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    next(error);
  }
});

export default router;
