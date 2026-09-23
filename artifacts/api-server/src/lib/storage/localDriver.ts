import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  canAccessObject,
  setObjectAclPolicy,
  type LocalFileRef,
  type ObjectAclPolicy,
  type ObjectPermission,
} from "../objectAcl";
import {
  ObjectNotFoundError,
  type DownloadOptions,
  type StorageDriver,
  type StorageObjectRef,
  type StoredObjectMeta,
} from "./types";

// ---------------------------------------------------------------------------
// Local-disk driver.
//
// Files live under UPLOAD_DIR (default "<cwd>/uploads"):
//   private entities -> UPLOAD_DIR/<entityId>            (e.g. uploads/<uuid>)
//   public assets    -> UPLOAD_DIR/public/<relPath>
// Each file has companion sidecars: <file>.meta.json (content-type) and
// <file>.acl.json (ACL policy).
//
// This driver also doubles as the read-fallback used by the S3 / Replit
// drivers so files written to disk by older builds remain readable.
// ---------------------------------------------------------------------------

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

interface FileMeta {
  contentType: string;
}

async function readMeta(filePath: string): Promise<FileMeta | null> {
  try {
    const raw = await fsPromises.readFile(filePath + ".meta.json", "utf-8");
    return JSON.parse(raw) as FileMeta;
  } catch {
    return null;
  }
}

export async function writeFileMeta(
  filePath: string,
  meta: FileMeta,
): Promise<void> {
  await fsPromises.writeFile(
    filePath + ".meta.json",
    JSON.stringify(meta),
    "utf-8",
  );
}

// Magic-byte sniffing for legacy/migrated files that have no .meta.json
// sidecar. Without it such files were served as application/octet-stream which,
// combined with nosniff, broke image rendering and downloads.
async function sniffContentType(filePath: string): Promise<string | null> {
  let fh: fsPromises.FileHandle | undefined;
  try {
    fh = await fsPromises.open(filePath, "r");
    const buf = Buffer.alloc(8);
    const { bytesRead } = await fh.read(buf, 0, 8, 0);
    if (
      bytesRead >= 4 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytesRead >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytesRead >= 4 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46
    ) {
      return "application/pdf";
    }
    return null;
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

// Resolve the authoritative content type for a stored file. Prefers an existing
// sidecar; otherwise sniffs the magic bytes and self-heals by writing a sidecar
// so the work happens only once per file.
async function resolveContentType(
  filePath: string,
  meta: FileMeta | null,
): Promise<string> {
  if (meta?.contentType && meta.contentType !== "application/octet-stream") {
    return meta.contentType;
  }
  const sniffed = await sniffContentType(filePath);
  if (sniffed) {
    await writeFileMeta(filePath, { contentType: sniffed }).catch(() => {});
    return sniffed;
  }
  return meta?.contentType || "application/octet-stream";
}

// Build an RFC 6266 Content-Disposition header with both an ASCII filename and
// a UTF-8 (RFC 5987) variant so non-ASCII names survive.
export function formatContentDisposition(
  download: boolean,
  fileName?: string,
): string {
  const type = download ? "attachment" : "inline";
  if (!fileName) {
    return type;
  }
  const asciiName = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${type}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

function localRef(ref: StorageObjectRef): LocalFileRef {
  if (!("filePath" in ref)) {
    // Should never happen — refKind() routes only local refs here.
    throw new ObjectNotFoundError();
  }
  return { filePath: ref.filePath };
}

export class LocalDriver implements StorageDriver {
  readonly kind = "local" as const;

  private get uploadDir(): string {
    return getUploadDir();
  }

  private entityFilePath(entityId: string): string {
    return path.join(this.uploadDir, entityId);
  }

  async resolveEntity(entityId: string): Promise<StorageObjectRef> {
    const filePath = this.entityFilePath(entityId);
    try {
      await fsPromises.access(filePath);
      return { backend: "local", filePath };
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  async resolvePublic(relPath: string): Promise<StorageObjectRef | null> {
    const publicRoot = path.resolve(this.uploadDir, "public");
    const filePath = path.resolve(publicRoot, relPath);
    // Defense in depth: never resolve outside the public root, even if a caller
    // bypasses the facade-level sanitizer.
    if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
      return null;
    }
    try {
      await fsPromises.access(filePath);
      return { backend: "local", filePath };
    } catch {
      return null;
    }
  }

  async download(
    ref: StorageObjectRef,
    opts: DownloadOptions = {},
  ): Promise<Response> {
    const { filePath } = localRef(ref);
    const { cacheTtlSec = 3600, download = false, fileName } = opts;
    let stat: fs.Stats;
    let meta: FileMeta | null;
    let aclPolicy: ObjectAclPolicy | null;
    try {
      [stat, meta, aclPolicy] = await Promise.all([
        fsPromises.stat(filePath),
        readMeta(filePath),
        readAclSidecar(filePath),
      ]);
    } catch {
      throw new ObjectNotFoundError();
    }

    const contentType = await resolveContentType(filePath, meta);
    const isPublic = aclPolicy?.visibility === "public";
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": formatContentDisposition(
          download,
          fileName ?? path.basename(filePath),
        ),
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        "Content-Length": String(stat.size),
      },
    });
  }

  async head(entityId: string): Promise<StoredObjectMeta> {
    const filePath = this.entityFilePath(entityId);
    let stat: fs.Stats;
    let meta: FileMeta | null;
    try {
      [stat, meta] = await Promise.all([
        fsPromises.stat(filePath),
        readMeta(filePath),
      ]);
    } catch {
      throw new ObjectNotFoundError();
    }
    return { contentType: meta?.contentType || null, size: stat.size };
  }

  async getBuffer(entityId: string): Promise<Buffer> {
    try {
      return await fsPromises.readFile(this.entityFilePath(entityId));
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  async putBuffer(
    entityId: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const filePath = this.entityFilePath(entityId);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, body);
    await writeFileMeta(filePath, { contentType });
  }

  async deleteEntity(entityId: string): Promise<void> {
    const filePath = this.entityFilePath(entityId);
    await Promise.all([
      fsPromises.unlink(filePath).catch(() => {}),
      fsPromises.unlink(filePath + ".meta.json").catch(() => {}),
      fsPromises.unlink(filePath + ".acl.json").catch(() => {}),
    ]);
  }

  async setAcl(entityId: string, policy: ObjectAclPolicy): Promise<void> {
    await setObjectAclPolicy({ filePath: this.entityFilePath(entityId) }, policy);
  }

  async canAccess(
    ref: StorageObjectRef,
    args: { userId?: string; requestedPermission: ObjectPermission },
  ): Promise<boolean> {
    return canAccessObject({
      userId: args.userId,
      objectFile: localRef(ref),
      requestedPermission: args.requestedPermission,
    });
  }
}

async function readAclSidecar(filePath: string): Promise<ObjectAclPolicy | null> {
  try {
    const raw = await fsPromises.readFile(filePath + ".acl.json", "utf-8");
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

let singleton: LocalDriver | null = null;
export function createLocalDriver(): LocalDriver {
  if (!singleton) singleton = new LocalDriver();
  return singleton;
}
