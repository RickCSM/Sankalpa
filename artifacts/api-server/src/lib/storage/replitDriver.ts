import { Readable } from "node:stream";
import {
  evaluateObjectAccess,
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
import { formatContentDisposition } from "./localDriver";

// ---------------------------------------------------------------------------
// Replit Object Storage (App Storage) driver.
//
// Backed by Google Cloud Storage through the Replit sidecar (no service-account
// key needed — the sidecar mints credentials). Env vars are provisioned by the
// Object Storage tool:
//   PRIVATE_OBJECT_DIR        e.g. "/<bucketId>/.private"
//   PUBLIC_OBJECT_SEARCH_PATHS comma-separated, e.g. "/<bucketId>/public"
//
// Object layout:
//   private entities -> <PRIVATE_OBJECT_DIR>/<entityId>  (e.g. uploads/<uuid>)
//   public assets    -> <searchPath>/<relPath>
// Content-type is stored as native GCS object metadata. The ACL policy lives in
// a companion object "<objectName>.acl.json".
// ---------------------------------------------------------------------------

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

type GcsFile = {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{ contentType?: string; size?: string | number }]>;
  createReadStream(): Readable;
  download(): Promise<[Buffer]>;
  save(data: Buffer, opts?: { contentType?: string }): Promise<void>;
  delete(opts?: { ignoreNotFound?: boolean }): Promise<unknown>;
};

type GcsBucket = { file(name: string): GcsFile };
type GcsStorage = { bucket(name: string): GcsBucket };

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  let s = p;
  if (!s.startsWith("/")) s = `/${s}`;
  const parts = s.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must include a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Provision the Object Storage tool to use the Replit storage backend.",
    );
  }
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

function getPublicSearchPaths(): string[] {
  return Array.from(
    new Set(
      (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export class ReplitDriver implements StorageDriver {
  readonly kind = "replit" as const;
  private storageP: Promise<GcsStorage> | null = null;

  private async storage(): Promise<GcsStorage> {
    if (!this.storageP) {
      this.storageP = (async () => {
        const { Storage } = await import("@google-cloud/storage");
        return new Storage({
          credentials: {
            audience: "replit",
            subject_token_type: "access_token",
            token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
            type: "external_account",
            credential_source: {
              url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
              format: {
                type: "json",
                subject_token_field_name: "access_token",
              },
            },
            universe_domain: "googleapis.com",
          },
          projectId: "",
        }) as unknown as GcsStorage;
      })();
    }
    return this.storageP;
  }

  private async fileFor(fullPath: string): Promise<GcsFile> {
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const storage = await this.storage();
    return storage.bucket(bucketName).file(objectName);
  }

  private privatePath(entityId: string): string {
    return `${getPrivateObjectDir()}/${entityId}`;
  }

  async resolveEntity(entityId: string): Promise<StorageObjectRef> {
    const file = await this.fileFor(this.privatePath(entityId));
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return { backend: "replit", entityId };
  }

  async resolvePublic(relPath: string): Promise<StorageObjectRef | null> {
    for (const searchPath of getPublicSearchPaths()) {
      const file = await this.fileFor(`${searchPath}/${relPath}`);
      const [exists] = await file.exists();
      if (exists) {
        // Encode the resolved full path so download() can re-open it without
        // re-searching. Public refs reuse the entityId slot for the full path.
        return { backend: "replit", entityId: `\u0000public\u0000${searchPath}/${relPath}` };
      }
    }
    return null;
  }

  private async fileForRef(ref: StorageObjectRef): Promise<GcsFile> {
    if (!("entityId" in ref)) throw new ObjectNotFoundError();
    const id = ref.entityId;
    if (id.startsWith("\u0000public\u0000")) {
      return this.fileFor(id.slice("\u0000public\u0000".length));
    }
    return this.fileFor(this.privatePath(id));
  }

  async head(entityId: string): Promise<StoredObjectMeta> {
    const file = await this.fileFor(this.privatePath(entityId));
    try {
      const [md] = await file.getMetadata();
      return {
        contentType: md.contentType || null,
        size: md.size != null ? Number(md.size) : null,
      };
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async getBuffer(entityId: string): Promise<Buffer> {
    const file = await this.fileFor(this.privatePath(entityId));
    try {
      const [buf] = await file.download();
      return buf;
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async putBuffer(
    entityId: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const file = await this.fileFor(this.privatePath(entityId));
    await file.save(body, { contentType });
  }

  async deleteEntity(entityId: string): Promise<void> {
    const file = await this.fileFor(this.privatePath(entityId));
    const acl = await this.fileFor(`${this.privatePath(entityId)}.acl.json`);
    await Promise.all([
      file.delete({ ignoreNotFound: true }).catch(() => {}),
      acl.delete({ ignoreNotFound: true }).catch(() => {}),
    ]);
  }

  private async readAcl(entityId: string): Promise<ObjectAclPolicy | null> {
    const file = await this.fileFor(`${this.privatePath(entityId)}.acl.json`);
    try {
      const [buf] = await file.download();
      return JSON.parse(buf.toString("utf-8")) as ObjectAclPolicy;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async setAcl(entityId: string, policy: ObjectAclPolicy): Promise<void> {
    const file = await this.fileFor(`${this.privatePath(entityId)}.acl.json`);
    await file.save(Buffer.from(JSON.stringify(policy), "utf-8"), {
      contentType: "application/json",
    });
  }

  async download(
    ref: StorageObjectRef,
    opts: DownloadOptions = {},
  ): Promise<Response> {
    const file = await this.fileForRef(ref);
    const { cacheTtlSec = 3600, download = false, fileName } = opts;
    let md: { contentType?: string; size?: string | number };
    try {
      [md] = await file.getMetadata();
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
    const entityId = "entityId" in ref ? ref.entityId : "";
    const isPublicRef = entityId.startsWith("\u0000public\u0000");
    const acl = isPublicRef ? null : await this.readAcl(entityId).catch(() => null);
    const isPublic = isPublicRef || acl?.visibility === "public";
    const webStream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const baseName = (fileName ?? entityId).split("/").pop() || "file";
    const headers: Record<string, string> = {
      "Content-Type": md.contentType || "application/octet-stream",
      "Content-Disposition": formatContentDisposition(download, fileName ?? baseName),
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (md.size != null) headers["Content-Length"] = String(md.size);
    return new Response(webStream, { headers });
  }

  async canAccess(
    ref: StorageObjectRef,
    args: { userId?: string; requestedPermission: ObjectPermission },
  ): Promise<boolean> {
    if (!("entityId" in ref)) return false;
    const acl = await this.readAcl(ref.entityId);
    return evaluateObjectAccess(acl, args);
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { code?: number; status?: number } | undefined;
  return e?.code === 404 || e?.status === 404;
}

let singleton: ReplitDriver | null = null;
export function createReplitDriver(): ReplitDriver {
  if (!singleton) singleton = new ReplitDriver();
  return singleton;
}
