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
// S3 / MinIO driver.
//
// Configured entirely from environment variables (see deploy/README.md). MinIO
// is S3-API compatible, so the same client works against MinIO or AWS S3:
//   S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
//   S3_FORCE_PATH_STYLE (default true — required for MinIO), S3_PREFIX.
//
// Object layout (mirrors the local driver, prefixed by S3_PREFIX):
//   private entities -> <prefix><entityId>            (e.g. uploads/<uuid>)
//   public assets    -> <prefix>public/<relPath>
// Content-type is stored as native S3 object metadata. The ACL policy lives in
// a companion object "<key>.acl.json" (S3 has no per-object sidecar concept).
// ---------------------------------------------------------------------------

// Minimal structural types for the lazily-imported AWS SDK so the rest of the
// file stays typed without a hard top-level dependency on @aws-sdk/client-s3.
type S3ClientLike = {
  send(command: unknown): Promise<unknown>;
};

interface S3Commands {
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
}

interface S3Config {
  bucket: string;
  prefix: string;
}

function readConfig(): S3Config {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET must be set to use the S3 storage backend.");
  }
  let prefix = process.env.S3_PREFIX || "";
  if (prefix && !prefix.endsWith("/")) prefix = `${prefix}/`;
  return { bucket, prefix };
}

function isNotFound(err: unknown): boolean {
  const e = err as
    | { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    | undefined;
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.Code === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

async function toBuffer(body: unknown): Promise<Buffer> {
  // AWS SDK v3 Body in Node is a Readable with transformToByteArray(), but be
  // defensive and fall back to manual draining.
  const b = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  } | null;
  if (b?.transformToByteArray) {
    return Buffer.from(await b.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toWebStream(body: unknown): ReadableStream {
  const b = body as { transformToWebStream?: () => ReadableStream } | null;
  if (b?.transformToWebStream) {
    return b.transformToWebStream();
  }
  return Readable.toWeb(body as Readable) as ReadableStream;
}

export class S3Driver implements StorageDriver {
  readonly kind = "s3" as const;
  private clientP: Promise<{ client: S3ClientLike; cmd: S3Commands }> | null =
    null;
  private readonly cfg: S3Config;

  constructor() {
    this.cfg = readConfig();
  }

  private async sdk(): Promise<{ client: S3ClientLike; cmd: S3Commands }> {
    if (!this.clientP) {
      this.clientP = (async () => {
        const mod = await import("@aws-sdk/client-s3");
        const {
          S3Client,
          GetObjectCommand,
          HeadObjectCommand,
          PutObjectCommand,
          DeleteObjectCommand,
        } = mod;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const client = new S3Client({
          region: process.env.S3_REGION || "us-east-1",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle:
            (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !==
            "false",
          credentials:
            accessKeyId && secretAccessKey
              ? { accessKeyId, secretAccessKey }
              : undefined,
        }) as unknown as S3ClientLike;
        return {
          client,
          cmd: {
            GetObjectCommand,
            HeadObjectCommand,
            PutObjectCommand,
            DeleteObjectCommand,
          } as unknown as S3Commands,
        };
      })();
    }
    return this.clientP;
  }

  private key(entityId: string): string {
    return `${this.cfg.prefix}${entityId}`;
  }

  private keyOf(ref: StorageObjectRef): string {
    if (!("key" in ref)) throw new ObjectNotFoundError();
    return ref.key;
  }

  async resolveEntity(entityId: string): Promise<StorageObjectRef> {
    const key = this.key(entityId);
    await this.headKey(key); // throws ObjectNotFoundError if missing
    return { backend: "s3", key };
  }

  async resolvePublic(relPath: string): Promise<StorageObjectRef | null> {
    const key = `${this.cfg.prefix}public/${relPath}`;
    try {
      await this.headKey(key);
      return { backend: "s3", key };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  private async headKey(key: string): Promise<StoredObjectMeta> {
    const { client, cmd } = await this.sdk();
    try {
      const res = (await client.send(
        new cmd.HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      )) as { ContentType?: string; ContentLength?: number };
      return {
        contentType: res.ContentType || null,
        size: res.ContentLength ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
  }

  async head(entityId: string): Promise<StoredObjectMeta> {
    return this.headKey(this.key(entityId));
  }

  async getBuffer(entityId: string): Promise<Buffer> {
    const { client, cmd } = await this.sdk();
    try {
      const res = (await client.send(
        new cmd.GetObjectCommand({
          Bucket: this.cfg.bucket,
          Key: this.key(entityId),
        }),
      )) as { Body?: unknown };
      return toBuffer(res.Body);
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
    const { client, cmd } = await this.sdk();
    await client.send(
      new cmd.PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: this.key(entityId),
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async deleteEntity(entityId: string): Promise<void> {
    const { client, cmd } = await this.sdk();
    const key = this.key(entityId);
    await Promise.all([
      client
        .send(
          new cmd.DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
        )
        .catch(() => {}),
      client
        .send(
          new cmd.DeleteObjectCommand({
            Bucket: this.cfg.bucket,
            Key: `${key}.acl.json`,
          }),
        )
        .catch(() => {}),
    ]);
  }

  private async readAcl(key: string): Promise<ObjectAclPolicy | null> {
    const { client, cmd } = await this.sdk();
    try {
      const res = (await client.send(
        new cmd.GetObjectCommand({
          Bucket: this.cfg.bucket,
          Key: `${key}.acl.json`,
        }),
      )) as { Body?: unknown };
      const buf = await toBuffer(res.Body);
      return JSON.parse(buf.toString("utf-8")) as ObjectAclPolicy;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async setAcl(entityId: string, policy: ObjectAclPolicy): Promise<void> {
    const { client, cmd } = await this.sdk();
    await client.send(
      new cmd.PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: `${this.key(entityId)}.acl.json`,
        Body: Buffer.from(JSON.stringify(policy), "utf-8"),
        ContentType: "application/json",
      }),
    );
  }

  async download(
    ref: StorageObjectRef,
    opts: DownloadOptions = {},
  ): Promise<Response> {
    const key = this.keyOf(ref);
    const { client, cmd } = await this.sdk();
    const { cacheTtlSec = 3600, download = false, fileName } = opts;
    let res: { Body?: unknown; ContentType?: string; ContentLength?: number };
    try {
      res = (await client.send(
        new cmd.GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      )) as { Body?: unknown; ContentType?: string; ContentLength?: number };
    } catch (err) {
      if (isNotFound(err)) throw new ObjectNotFoundError();
      throw err;
    }
    const acl = await this.readAcl(key).catch(() => null);
    const isPublic = acl?.visibility === "public";
    const baseName = key.slice(key.lastIndexOf("/") + 1);
    const headers: Record<string, string> = {
      "Content-Type": res.ContentType || "application/octet-stream",
      "Content-Disposition": formatContentDisposition(
        download,
        fileName ?? baseName,
      ),
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (res.ContentLength != null) {
      headers["Content-Length"] = String(res.ContentLength);
    }
    return new Response(toWebStream(res.Body), { headers });
  }

  async canAccess(
    ref: StorageObjectRef,
    args: { userId?: string; requestedPermission: ObjectPermission },
  ): Promise<boolean> {
    const acl = await this.readAcl(this.keyOf(ref));
    return evaluateObjectAccess(acl, args);
  }
}

let singleton: S3Driver | null = null;
export function createS3Driver(): S3Driver {
  if (!singleton) singleton = new S3Driver();
  return singleton;
}
