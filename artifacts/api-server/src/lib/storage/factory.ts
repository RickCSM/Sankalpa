import { logger } from "../logger";
import { createLocalDriver } from "./localDriver";
import { createS3Driver } from "./s3Driver";
import { createReplitDriver } from "./replitDriver";
import type { BackendKind, StorageDriver } from "./types";

// ---------------------------------------------------------------------------
// Backend selection.
//
// Driven by configuration only — the same build runs everywhere:
//   1. STORAGE_BACKEND=local|s3|replit forces a backend explicitly.
//   2. Otherwise auto-detect: S3/MinIO env present -> s3; Replit Object Storage
//      env present -> replit; else local-disk dev fallback.
// ---------------------------------------------------------------------------
export function resolveBackendKind(): BackendKind {
  const explicit = process.env.STORAGE_BACKEND?.toLowerCase().trim();
  if (explicit === "local" || explicit === "s3" || explicit === "replit") {
    return explicit;
  }
  if (explicit) {
    logger.warn(
      { STORAGE_BACKEND: explicit },
      "Unknown STORAGE_BACKEND value; falling back to auto-detection",
    );
  }

  const hasS3 =
    !!process.env.S3_BUCKET &&
    !!process.env.S3_ACCESS_KEY_ID &&
    !!process.env.S3_SECRET_ACCESS_KEY;
  if (hasS3) return "s3";

  const hasReplit =
    !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID &&
    !!process.env.PRIVATE_OBJECT_DIR;
  if (hasReplit) return "replit";

  return "local";
}

function makeDriver(kind: BackendKind): StorageDriver {
  switch (kind) {
    case "s3":
      return createS3Driver();
    case "replit":
      return createReplitDriver();
    default:
      return createLocalDriver();
  }
}

const driverByKind = new Map<BackendKind, StorageDriver>();

// Memoized driver for a specific backend, used to route ref-based operations
// (download / access checks) to the backend that produced the ref, and to back
// the local read-fallback regardless of which backend is active.
export function getDriverByKind(kind: BackendKind): StorageDriver {
  let d = driverByKind.get(kind);
  if (!d) {
    d = makeDriver(kind);
    driverByKind.set(kind, d);
  }
  return d;
}

let activeKind: BackendKind | null = null;

export function getActiveBackendKind(): BackendKind {
  if (!activeKind) {
    activeKind = resolveBackendKind();
    logger.info({ backend: activeKind }, "Object storage backend selected");
  }
  return activeKind;
}

export function getStorageDriver(): StorageDriver {
  return getDriverByKind(getActiveBackendKind());
}

// When the active backend is not local, legacy files written to disk by older
// builds (or seeded into the deployment) should still be readable. This returns
// the local driver as a read-only fallback in that case, else null.
export function getLocalFallbackDriver(): StorageDriver | null {
  return getActiveBackendKind() === "local" ? null : getDriverByKind("local");
}
