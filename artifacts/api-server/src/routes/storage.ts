import { Router, type IRouter, type Request, type Response } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";
import { mintUploadToken } from "../lib/uploadToken";
import { assertCanAttachToAnnouncement, ATTACHMENT_WRITE_ROLES } from "./attachments";
import { HttpError } from "../lib/errors";
import { Readable } from "node:stream";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /storage/uploads/request-url
 *
 * Authenticated users request a local upload URL for direct streaming upload.
 * Returns a PUT URL that points at this same Express server.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const actor = req.session.user!;
    const { name, size, contentType, announcementId } = parsed.data;

    if (!ATTACHMENT_WRITE_ROLES.has(actor.role)) {
      throw new HttpError(403, "Forbidden");
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      throw new HttpError(400, "File type not allowed. Only PDF, JPEG, and PNG are accepted.");
    }
    await assertCanAttachToAnnouncement(actor, announcementId);

    // Build the base URL the browser will use to PUT the file.
    // In production behind nginx, always set PUBLIC_API_URL (e.g.
    // "https://sankalpa.odisha.gov.in") so the browser receives a reachable
    // URL instead of an internal localhost address.
    // Falls back to deriving from the request headers in dev (Replit proxy
    // forwards the correct host/proto, so this works in development).
    const baseUrl =
      (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(baseUrl);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const uploadToken = mintUploadToken(actor.id, announcementId, objectPath);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        uploadToken,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * PUT /storage/uploads/put/:objectId
 *
 * Receives the raw file body and saves it to local disk.
 * This replaces the browser's direct-to-GCS presigned PUT upload.
 *
 * The objectId must be a valid UUID (v4). The content-type declared by the
 * browser is saved in a .meta.json sidecar next to the file.
 * The uploadToken is verified during attachment registration (POST
 * /announcements/:id/attachments), not here — keeping this endpoint lean.
 */
router.put("/storage/uploads/put/:objectId", requireAuth, async (req: Request, res: Response) => {
  try {
    const objectId = String(req.params.objectId);

    // Validate UUID format to prevent path traversal
    if (!/^[a-f0-9-]{36}$/i.test(objectId)) {
      res.status(400).json({ error: "Invalid object ID" });
      return;
    }

    const contentType = req.headers["content-type"] || "application/octet-stream";
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      res.status(400).json({ error: "File type not allowed. Only PDF, JPEG, and PNG are accepted." });
      return;
    }

    // Buffer the raw request body (with a hard size cap) and persist it to the
    // active storage backend. The content-type travels with the object so
    // getObjectEntityRealMetadata can re-verify it at registration time.
    await objectStorageService.putUploadFromRequest(
      objectId,
      req,
      contentType,
      MAX_UPLOAD_BYTES,
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Error receiving uploaded file");
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * GET /storage/public-objects/* — public assets (no auth).
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

// Note: Private object streaming (/storage/objects/*) lives in
// `routes/attachments.ts`, which re-checks announcement visibility.

export default router;
