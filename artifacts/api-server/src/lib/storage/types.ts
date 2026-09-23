import type { ObjectAclPolicy, ObjectPermission } from "../objectAcl";

// ---------------------------------------------------------------------------
// Shared storage-driver contract.
//
// A driver hides where files physically live. The app talks only to
// ObjectStorageService, which delegates to whichever driver the environment
// selected (local disk, S3/MinIO, or Replit Object Storage). This keeps the
// upload flow, routes, tokens, and frontend identical across backends.
// ---------------------------------------------------------------------------

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export type BackendKind = "local" | "s3" | "replit";

export interface StoredObjectMeta {
  contentType: string | null;
  size: number | null;
}

// A handle to a stored object. It is opaque to callers and carries a backend
// discriminant so ref-based operations (download / access checks) can be
// routed to the driver that produced it — even when a different driver is the
// currently-active one (e.g. a legacy local file read through the local
// fallback while S3 is active).
export type StorageObjectRef =
  | { backend?: "local"; filePath: string }
  | { backend: "s3"; key: string }
  | { backend: "replit"; entityId: string };

export function refKind(ref: StorageObjectRef): BackendKind {
  if ("filePath" in ref) return "local";
  if ("key" in ref) return "s3";
  return "replit";
}

export interface DownloadOptions {
  cacheTtlSec?: number;
  download?: boolean;
  fileName?: string;
}

export interface StorageDriver {
  readonly kind: BackendKind;

  // Resolve a private entity (entityId is the path after "/objects/", e.g.
  // "uploads/<uuid>"). Throws ObjectNotFoundError when the object is missing.
  resolveEntity(entityId: string): Promise<StorageObjectRef>;

  // Resolve a public asset by search-path-relative path. Returns null when
  // not found (public assets are served unconditionally).
  resolvePublic(relPath: string): Promise<StorageObjectRef | null>;

  // Build an HTTP Response streaming the object referenced by `ref`.
  download(ref: StorageObjectRef, opts?: DownloadOptions): Promise<Response>;

  // Content-type + byte size of a private entity. Throws ObjectNotFoundError.
  head(entityId: string): Promise<StoredObjectMeta>;

  // Read a private entity fully into memory. Throws ObjectNotFoundError.
  getBuffer(entityId: string): Promise<Buffer>;

  // Create/overwrite a private entity with the given bytes + content-type.
  putBuffer(entityId: string, body: Buffer, contentType: string): Promise<void>;

  // Best-effort removal (object + any ACL/meta companions). Never throws for a
  // missing object.
  deleteEntity(entityId: string): Promise<void>;

  // Persist the ACL policy for a private entity.
  setAcl(entityId: string, policy: ObjectAclPolicy): Promise<void>;

  // Access decision for a ref this driver produced.
  canAccess(
    ref: StorageObjectRef,
    args: { userId?: string; requestedPermission: ObjectPermission },
  ): Promise<boolean>;
}
