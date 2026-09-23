import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, uoiNoteAttachmentsTable, uoiNotesTable } from "@workspace/db";
import type { UserRole } from "@workspace/db";
import {
  RequestUoiNoteUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  mintUoiNoteUploadToken,
  verifyUoiNoteUploadToken,
} from "../lib/uploadToken";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.use(requireAuth);

// Roles mirror routes/uoi-notes.ts. READ roles may view/list/stream; WRITE
// roles may upload — but a single note's attachments may only be mutated by
// the note's creator (or an admin), matching the note edit/delete gate.
const UOI_NOTES_WRITE_ROLES = new Set<UserRole>([
  "admin",
  "chief_minister",
  "cmo_nodal",
  "cmo_reviewer",
  "ocac_viewer",
]);
const UOI_NOTES_READ_ROLES = UOI_NOTES_WRITE_ROLES;

// UOI note attachments are restricted to PDF and JPEG per the requirement.
// PNG (allowed for announcements) is intentionally excluded here.
const ALLOWED_UOI_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
]);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

// Visibility: any UOI read role can view a note that exists. Returns the note's
// creator so callers can apply ownership gates without a second query.
async function assertCanViewUoiNote(
  actor: NonNullable<Request["session"]["user"]>,
  id: number,
): Promise<{ createdBy: number }> {
  if (!UOI_NOTES_READ_ROLES.has(actor.role as UserRole)) {
    throw new HttpError(403, "Access denied");
  }
  const rows = await db
    .select({ createdBy: uoiNotesTable.createdBy })
    .from(uoiNotesTable)
    .where(eq(uoiNotesTable.id, id))
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "UOI note not found");
  return rows[0];
}

// Attaching/removing files modifies the note record, so it is restricted to the
// note's creator or an admin (mirrors the edit gate in routes/uoi-notes.ts).
async function assertCanAttachToUoiNote(
  actor: NonNullable<Request["session"]["user"]>,
  id: number,
): Promise<void> {
  if (!UOI_NOTES_WRITE_ROLES.has(actor.role as UserRole)) {
    throw new HttpError(403, "Access denied");
  }
  const rows = await db
    .select({ createdBy: uoiNotesTable.createdBy })
    .from(uoiNotesTable)
    .where(eq(uoiNotesTable.id, id))
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "UOI note not found");
  if (actor.role !== "admin" && rows[0].createdBy !== actor.id) {
    throw new HttpError(403, "You can only attach files to notes you created");
  }
}

const registerSchema = z.object({
  objectPath: z.string().min(1),
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().min(1).max(200).refine(
    (ct) => ALLOWED_UOI_ATTACHMENT_TYPES.has(ct),
    { message: "File type not allowed. Only PDF and JPG are accepted." },
  ),
  uploadToken: z.string().min(1),
});

/**
 * POST /storage/uoi-notes/uploads/request-url
 *
 * Mints a short-lived upload token bound to {actor, noteId, objectPath} and
 * returns the through-server PUT URL. The actual bytes are PUT to the shared
 * /storage/uploads/put/:objectId endpoint (see routes/storage.ts).
 */
router.post(
  "/storage/uoi-notes/uploads/request-url",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const parsed = RequestUoiNoteUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Missing or invalid required fields");
    }
    const { name, size, contentType, uoiNoteId } = parsed.data;

    if (!ALLOWED_UOI_ATTACHMENT_TYPES.has(contentType)) {
      throw new HttpError(400, "File type not allowed. Only PDF and JPG are accepted.");
    }
    await assertCanAttachToUoiNote(actor, uoiNoteId);

    const baseUrl =
      (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const uploadURL = await objectStorage.getObjectEntityUploadURL(baseUrl);
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    const uploadToken = mintUoiNoteUploadToken(actor.id, uoiNoteId, objectPath);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        uploadToken,
        metadata: { name, size, contentType },
      }),
    );
  }),
);

// GET /uoi-notes/:id/attachments — list (any read role).
router.get(
  "/uoi-notes/:id/attachments",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    await assertCanViewUoiNote(actor, id);
    const rows = await db
      .select()
      .from(uoiNoteAttachmentsTable)
      .where(eq(uoiNoteAttachmentsTable.noteId, id));
    res.json({ attachments: rows });
  }),
);

// POST /uoi-notes/:id/attachments — register an uploaded file.
router.post(
  "/uoi-notes/:id/attachments",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    await assertCanAttachToUoiNote(actor, id);
    const data = registerSchema.parse(req.body);
    const normalized = data.objectPath.startsWith("/objects/")
      ? data.objectPath
      : objectStorage.normalizeObjectEntityPath(data.objectPath);

    // Verify the token binds {actor, noteId, objectPath} so a user cannot
    // register a file someone else uploaded, against a note other than the one
    // they requested the URL for.
    const verdict = verifyUoiNoteUploadToken(data.uploadToken, actor.id, id, normalized);
    if (!verdict.ok) {
      throw new HttpError(403, verdict.reason);
    }

    // Replay protection: each upload-URL request returns a fresh UUID, so a
    // duplicate objectPath means the token has already been consumed.
    const existing = await db
      .select({ id: uoiNoteAttachmentsTable.id })
      .from(uoiNoteAttachmentsTable)
      .where(eq(uoiNoteAttachmentsTable.objectPath, normalized))
      .limit(1);
    if (existing[0]) {
      throw new HttpError(409, "Upload token already consumed");
    }

    // Re-verify the stored object's real content-type / size; the client cannot
    // be trusted because the PUT does not bind those fields.
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
    if (!realContentType || !ALLOWED_UOI_ATTACHMENT_TYPES.has(realContentType)) {
      throw new HttpError(400, "File type not allowed. Only PDF and JPG are accepted.");
    }
    if (realSize == null || realSize > MAX_ATTACHMENT_BYTES) {
      throw new HttpError(400, "File exceeds maximum allowed size of 10 MB.");
    }

    // Per-note duplicate guard: same filename (case-insensitive) AND same
    // trusted byte length already attached to this note.
    const duplicate = await db
      .select({ id: uoiNoteAttachmentsTable.id })
      .from(uoiNoteAttachmentsTable)
      .where(
        and(
          eq(uoiNoteAttachmentsTable.noteId, id),
          sql`lower(${uoiNoteAttachmentsTable.fileName}) = lower(${data.fileName})`,
          eq(uoiNoteAttachmentsTable.fileSize, realSize),
        ),
      )
      .limit(1);
    if (duplicate[0]) {
      throw new HttpError(
        409,
        "A file with the same name and size is already attached to this note",
      );
    }

    let row;
    try {
      [row] = await db
        .insert(uoiNoteAttachmentsTable)
        .values({
          noteId: id,
          objectPath: normalized,
          fileName: data.fileName,
          fileSize: realSize,
          contentType: realContentType,
          uploadedBy: actor.id,
        })
        .returning();
    } catch (err: unknown) {
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

// DELETE /uoi-note-attachments/:id — uploader or admin.
router.delete(
  "/uoi-note-attachments/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const id = parseId(req.params.id);
    const [row] = await db
      .select()
      .from(uoiNoteAttachmentsTable)
      .where(eq(uoiNoteAttachmentsTable.id, id))
      .limit(1);
    if (!row) throw new HttpError(404, "Not found");
    if (row.uploadedBy !== actor.id && actor.role !== "admin") {
      throw new HttpError(403, "Forbidden");
    }
    await db.delete(uoiNoteAttachmentsTable).where(eq(uoiNoteAttachmentsTable.id, id));
    res.status(204).end();
  }),
);

/**
 * Stream a UOI note attachment after re-checking that the requester can view
 * the parent note. The objectPath comes from
 * `/api/storage/uoi-note-objects/<rest>`.
 */
router.get("/storage/uoi-note-objects/*path", async (req: Request, res: Response, next) => {
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
      .from(uoiNoteAttachmentsTable)
      .where(eq(uoiNoteAttachmentsTable.objectPath, objectPath))
      .limit(1);
    if (!att[0]) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await assertCanViewUoiNote(actor, att[0].noteId);
    const download = req.query.download === "1" || req.query.download === "true";
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file, {
      download,
      fileName: att[0].fileName,
    });
    res.status(response.status);
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
