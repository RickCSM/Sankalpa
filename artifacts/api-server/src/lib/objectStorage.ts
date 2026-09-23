import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import {
  type LocalFileRef,
  ObjectAclPolicy,
  ObjectPermission,
} from "./objectAcl";
import { HttpError } from "./errors";
import {
  getStorageDriver,
  getLocalFallbackDriver,
  getDriverByKind,
} from "./storage/factory";
import {
  ObjectNotFoundError,
  refKind,
  type DownloadOptions,
  type StorageDriver,
  type StorageObjectRef,
} from "./storage/types";

export { ObjectNotFoundError };
export type { LocalFileRef, StorageObjectRef };

// Normalize a client-supplied public-object path and guarantee it cannot escape
// the "public/" namespace. Returns the cleaned relative path, or null if the
// input attempts traversal ("..") or is absolute. Applied for every backend so
// the local read-fallback can never be tricked into serving private files.
function sanitizePublicRelPath(filePath: string): string | null {
  if (!filePath) return null;
  // Reject absolute paths (POSIX and Windows-style) outright.
  if (path.isAbsolute(filePath) || /^[a-zA-Z]:[\\/]/.test(filePath)) return null;
  const normalized = path.posix.normalize(filePath.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return null;
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// ObjectStorageService
//
// Thin facade over a pluggable StorageDriver. The active backend (local disk,
// S3/MinIO, or Replit Object Storage) is chosen from the environment; see
// lib/storage/factory.ts. Public method signatures are preserved so routes,
// upload tokens, and the frontend are unchanged across backends.
//
// Two dispatch rules keep legacy data and tests working:
//   * Ref-based operations (downloadObject / canAccessObjectEntity) route to
//     the backend that *produced* the ref, not necessarily the active one.
//   * Entity reads fall back to local disk when the active backend misses, so
//     files written by older local-disk builds remain readable.
// ---------------------------------------------------------------------------
export class ObjectStorageService {
  private get active(): StorageDriver {
    return getStorageDriver();
  }

  private get localFallback(): StorageDriver | null {
    return getLocalFallbackDriver();
  }

  private entityIdFromPath(objectPath: string): string {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length); // e.g. "uploads/<uuid>"
    if (!entityId || entityId.includes("..") || path.isAbsolute(entityId)) {
      throw new ObjectNotFoundError();
    }
    return entityId;
  }

  // Run a read against the active backend, falling back to local disk only on a
  // genuine miss so legacy/seeded files stay reachable.
  private async withReadFallback<T>(
    primary: () => Promise<T>,
    fallback: (driver: StorageDriver) => Promise<T>,
  ): Promise<T> {
    try {
      return await primary();
    } catch (err) {
      if (err instanceof ObjectNotFoundError && this.localFallback) {
        return fallback(this.localFallback);
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Upload URL — returns this Express server's PUT endpoint (through-server
  // upload). The object is created when the browser PUTs to the URL.
  // -------------------------------------------------------------------------
  async getObjectEntityUploadURL(baseUrl: string): Promise<string> {
    const uuid = randomUUID();
    return `${baseUrl}/api/storage/uploads/put/${uuid}`;
  }

  // Convert an upload PUT URL → "/objects/uploads/<uuid>".
  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const match = url.pathname.match(
        /\/api\/storage\/uploads\/put\/([a-f0-9-]{36})$/i,
      );
      if (match) {
        return `/objects/uploads/${match[1]}`;
      }
    } catch {
      // Not a URL — fall through.
    }
    return rawPath;
  }

  // -------------------------------------------------------------------------
  // PUT handler body → storage. Buffers the raw request with a hard size cap,
  // then hands the bytes to the active driver. Buffering in memory is safe here
  // because the cap (10 MB) bounds it, and it unifies the write path across all
  // backends.
  // -------------------------------------------------------------------------
  async putUploadFromRequest(
    objectId: string,
    req: Request,
    contentType: string,
    maxBytes: number,
  ): Promise<void> {
    const body = await readRequestWithCap(req, maxBytes);
    await this.active.putBuffer(`uploads/${objectId}`, body, contentType);
  }

  // -------------------------------------------------------------------------
  // Entity resolution + metadata
  // -------------------------------------------------------------------------
  async getObjectEntityFile(objectPath: string): Promise<StorageObjectRef> {
    const entityId = this.entityIdFromPath(objectPath);
    return this.withReadFallback(
      () => this.active.resolveEntity(entityId),
      (d) => d.resolveEntity(entityId),
    );
  }

  async getObjectEntityRealMetadata(
    objectPath: string,
  ): Promise<{ contentType: string | null; size: number | null }> {
    const entityId = this.entityIdFromPath(objectPath);
    return this.withReadFallback(
      () => this.active.head(entityId),
      (d) => d.head(entityId),
    );
  }

  async readObjectBuffer(objectPath: string): Promise<Buffer> {
    const entityId = this.entityIdFromPath(objectPath);
    return this.withReadFallback(
      () => this.active.getBuffer(entityId),
      (d) => d.getBuffer(entityId),
    );
  }

  async writeObjectBuffer(
    objectPath: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const entityId = this.entityIdFromPath(objectPath);
    await this.active.putBuffer(entityId, body, contentType);
  }

  // Best-effort removal from the active backend and (when distinct) local disk,
  // so swapping a photo cleans up both new and any legacy copy.
  async deleteObjectEntity(objectPath: string): Promise<void> {
    let entityId: string;
    try {
      entityId = this.entityIdFromPath(objectPath);
    } catch {
      return;
    }
    await Promise.all([
      this.active.deleteEntity(entityId).catch(() => {}),
      this.localFallback?.deleteEntity(entityId).catch(() => {}) ??
        Promise.resolve(),
    ]);
  }

  // -------------------------------------------------------------------------
  // Public assets
  // -------------------------------------------------------------------------
  async searchPublicObject(filePath: string): Promise<StorageObjectRef | null> {
    const relPath = sanitizePublicRelPath(filePath);
    if (relPath === null) {
      // Reject path-traversal / absolute paths before any backend lookup so an
      // attacker can never escape the "public/" namespace into private objects.
      return null;
    }
    const fromActive = await this.active.resolvePublic(relPath);
    if (fromActive) return fromActive;
    if (this.localFallback) {
      return this.localFallback.resolvePublic(relPath);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Ref-based serving — dispatch to the backend that produced the ref.
  // -------------------------------------------------------------------------
  async downloadObject(
    ref: StorageObjectRef,
    opts: DownloadOptions = {},
  ): Promise<Response> {
    return getDriverByKind(refKind(ref)).download(ref, opts);
  }

  // -------------------------------------------------------------------------
  // ACL
  // -------------------------------------------------------------------------
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const entityId = this.entityIdFromPath(normalizedPath);
    await this.active.setAcl(entityId, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageObjectRef;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return getDriverByKind(refKind(objectFile)).canAccess(objectFile, {
      userId,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

// Drain an Express request body into a Buffer, rejecting once the byte cap is
// exceeded so a malicious client cannot exhaust memory.
function readRequestWithCap(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(err);
    };
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        fail(new HttpError(413, "File exceeds maximum allowed size of 10 MB."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => fail(err as Error));
  });
}
