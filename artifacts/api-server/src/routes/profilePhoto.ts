import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { mintProfilePhotoToken, verifyProfilePhotoToken } from "../lib/uploadToken";
import { Readable } from "node:stream";
import sharp from "sharp";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Profile photos must be raster images; the generic PUT endpoint also accepts
// PDF, so the real content-type is re-checked here at finalize time.
const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

// Avatars are always rendered small, so we downscale to a modest square and
// re-encode as JPEG on finalize. This keeps storage lean and page loads fast
// regardless of the original resolution the user uploaded.
const AVATAR_SIZE = 256; // px (square)
const AVATAR_JPEG_QUALITY = 82;

const uploadUrlSchema = z.object({
  contentType: z.string().min(1).max(255),
});

const finalizeSchema = z.object({
  objectPath: z.string().min(1).max(512),
  uploadToken: z.string().min(1).max(1024),
});

/**
 * POST /auth/profile-photo/upload-url
 *
 * Any authenticated user requests a one-time upload URL for their own profile
 * photo. The browser then PUTs the raw image to the returned uploadURL
 * (handled by the generic PUT /storage/uploads/put/:objectId endpoint) and
 * finalizes via PUT /auth/profile-photo.
 */
router.post(
  "/auth/profile-photo/upload-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const { contentType } = uploadUrlSchema.parse(req.body);
    if (!ALLOWED_PHOTO_TYPES.has(contentType)) {
      throw new HttpError(400, "File type not allowed. Only JPEG and PNG images are accepted.");
    }
    // See storage.ts for why PUBLIC_API_URL is preferred behind nginx.
    const baseUrl =
      (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "") ||
      `${req.protocol}://${req.get("host")}`;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(baseUrl);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const uploadToken = mintProfilePhotoToken(actor.id, objectPath);
    res.json({ uploadURL, objectPath, uploadToken });
  }),
);

/**
 * PUT /auth/profile-photo
 *
 * Finalize: verify the upload token binds {actor, objectPath}, confirm the
 * stored object is really a JPEG/PNG within the size cap, mark it private,
 * point the user's row at it, and clean up any previous photo.
 */
router.put(
  "/auth/profile-photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const data = finalizeSchema.parse(req.body);
    const normalized = data.objectPath.startsWith("/objects/")
      ? data.objectPath
      : objectStorageService.normalizeObjectEntityPath(data.objectPath);

    const verdict = verifyProfilePhotoToken(data.uploadToken, actor.id, normalized);
    if (!verdict.ok) {
      throw new HttpError(403, verdict.reason);
    }

    let realContentType: string | null;
    let realSize: number | null;
    try {
      ({ contentType: realContentType, size: realSize } =
        await objectStorageService.getObjectEntityRealMetadata(normalized));
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        throw new HttpError(400, "Uploaded image not found in storage");
      }
      throw err;
    }
    if (!realContentType || !ALLOWED_PHOTO_TYPES.has(realContentType)) {
      throw new HttpError(400, "File type not allowed. Only JPEG and PNG images are accepted.");
    }
    if (realSize == null || realSize > MAX_PHOTO_BYTES) {
      throw new HttpError(400, "Image exceeds the maximum allowed size of 5 MB.");
    }

    // Downscale + compress to a small square avatar so we never store or serve a
    // full-resolution photo. Any remaining transparency is flattened onto white
    // since the output is JPEG.
    await resizeProfilePhoto(normalized);

    // Mark the object private and owned by this user.
    await objectStorageService.trySetObjectEntityAclPolicy(normalized, {
      owner: String(actor.id),
      visibility: "private",
    });

    // Swap the row's pointer, capturing the previous path so we can delete the
    // now-orphaned file from disk.
    const [prev] = await db
      .select({ profileImagePath: usersTable.profileImagePath })
      .from(usersTable)
      .where(eq(usersTable.id, actor.id))
      .limit(1);
    await db
      .update(usersTable)
      .set({ profileImagePath: normalized, updatedAt: new Date() })
      .where(eq(usersTable.id, actor.id));

    if (prev?.profileImagePath && prev.profileImagePath !== normalized) {
      await deleteObjectQuietly(prev.profileImagePath);
    }

    actor.profileImagePath = normalized;
    req.session.user = actor;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.json({ user: actor });
  }),
);

/**
 * DELETE /auth/profile-photo — remove the current user's photo (revert to the
 * initials avatar) and delete the underlying file.
 */
router.delete(
  "/auth/profile-photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const [prev] = await db
      .select({ profileImagePath: usersTable.profileImagePath })
      .from(usersTable)
      .where(eq(usersTable.id, actor.id))
      .limit(1);
    await db
      .update(usersTable)
      .set({ profileImagePath: null, updatedAt: new Date() })
      .where(eq(usersTable.id, actor.id));
    if (prev?.profileImagePath) {
      await deleteObjectQuietly(prev.profileImagePath);
    }
    actor.profileImagePath = null;
    req.session.user = actor;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.json({ user: actor });
  }),
);

/**
 * GET /auth/profile-photo — stream the current user's own photo. Used directly
 * as an <img src>; the browser sends the session cookie automatically.
 */
router.get("/auth/profile-photo", requireAuth, async (req: Request, res: Response, next) => {
  try {
    const actor = req.session.user!;
    // Read the pointer from the DB (source of truth) rather than the session
    // snapshot, so a photo updated on another device is served correctly.
    const [row] = await db
      .select({ profileImagePath: usersTable.profileImagePath })
      .from(usersTable)
      .where(eq(usersTable.id, actor.id))
      .limit(1);
    const profileImagePath = row?.profileImagePath ?? null;
    if (!profileImagePath) {
      res.status(404).json({ error: "No profile photo" });
      return;
    }
    const file = await objectStorageService.getObjectEntityFile(profileImagePath);
    // Defence in depth: only ever serve the object the user actually owns.
    const allowed = await objectStorageService.canAccessObjectEntity({
      userId: String(actor.id),
      objectFile: file,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
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
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    next(error);
  }
});

/**
 * Resize/compress an uploaded profile photo in place to a small square avatar.
 *
 * The original (up to 5 MB, arbitrary dimensions) is replaced with a
 * center-cropped AVATAR_SIZE×AVATAR_SIZE JPEG. The .meta.json sidecar is
 * rewritten to image/jpeg so downloads advertise the correct content-type.
 */
async function resizeProfilePhoto(objectPath: string): Promise<void> {
  const original = await objectStorageService.readObjectBuffer(objectPath);
  const resized = await sharp(original)
    .rotate() // honour EXIF orientation before cropping
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: AVATAR_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  await objectStorageService.writeObjectBuffer(objectPath, resized, "image/jpeg");
}

/**
 * Best-effort removal of an object plus its ACL/meta companions across the
 * active backend and any legacy local copy. Failures are swallowed: an orphaned
 * file is not worth failing the request over.
 */
async function deleteObjectQuietly(objectPath: string): Promise<void> {
  await objectStorageService.deleteObjectEntity(objectPath);
}

export default router;
