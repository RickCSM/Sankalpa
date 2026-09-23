import { test } from "node:test";
import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ObjectStorageService } from "./objectStorage";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF_SIGNATURE = Buffer.from("%PDF-1.4\n", "ascii");

async function makeTempFile(bytes: Buffer, name = "legacy"): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "objstore-test-"));
  const filePath = path.join(dir, name);
  await fsPromises.writeFile(filePath, bytes);
  return filePath;
}

const storage = new ObjectStorageService();

test("serves a sidecar-less PNG with the real image content type", async () => {
  const filePath = await makeTempFile(PNG_SIGNATURE);
  const res = await storage.downloadObject({ filePath });
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.notEqual(res.headers.get("content-type"), "application/octet-stream");
});

test("serves a sidecar-less JPEG with the real image content type", async () => {
  const filePath = await makeTempFile(JPEG_SIGNATURE);
  const res = await storage.downloadObject({ filePath });
  assert.equal(res.headers.get("content-type"), "image/jpeg");
});

test("serves a sidecar-less PDF with the real content type", async () => {
  const filePath = await makeTempFile(PDF_SIGNATURE);
  const res = await storage.downloadObject({ filePath });
  assert.equal(res.headers.get("content-type"), "application/pdf");
});

test("self-heals by writing a .meta.json sidecar after sniffing", async () => {
  const filePath = await makeTempFile(PNG_SIGNATURE);
  await storage.downloadObject({ filePath });
  const raw = await fsPromises.readFile(filePath + ".meta.json", "utf-8");
  assert.deepEqual(JSON.parse(raw), { contentType: "image/png" });
});

test("download variant sets Content-Disposition attachment with the original filename", async () => {
  const filePath = await makeTempFile(PNG_SIGNATURE);
  const res = await storage.downloadObject({ filePath }, {
    download: true,
    fileName: "Holiday Notice.png",
  });
  const disposition = res.headers.get("content-disposition") ?? "";
  assert.match(disposition, /^attachment;/);
  assert.match(disposition, /filename="Holiday Notice\.png"/);
  assert.match(disposition, /filename\*=UTF-8''Holiday%20Notice\.png/);
});

test("view variant serves inline", async () => {
  const filePath = await makeTempFile(PNG_SIGNATURE);
  const res = await storage.downloadObject({ filePath });
  assert.match(res.headers.get("content-disposition") ?? "", /^inline/);
});

test("unrecognised bytes still fall back to octet-stream", async () => {
  const filePath = await makeTempFile(Buffer.from("not a known file", "ascii"));
  const res = await storage.downloadObject({ filePath });
  assert.equal(res.headers.get("content-type"), "application/octet-stream");
});

test("searchPublicObject serves a genuine public asset", async () => {
  const uploadDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "pub-test-"));
  await fsPromises.mkdir(path.join(uploadDir, "public"), { recursive: true });
  await fsPromises.writeFile(path.join(uploadDir, "public", "logo.png"), PNG_SIGNATURE);
  const prev = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = uploadDir;
  try {
    const ref = await storage.searchPublicObject("logo.png");
    assert.ok(ref, "expected the public asset to resolve");
  } finally {
    if (prev === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prev;
  }
});

test("searchPublicObject rejects path traversal into private files", async () => {
  const uploadDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "pub-test-"));
  await fsPromises.mkdir(path.join(uploadDir, "public"), { recursive: true });
  // A private object living next to (not inside) the public namespace.
  await fsPromises.writeFile(path.join(uploadDir, "secret.png"), PNG_SIGNATURE);
  const prev = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = uploadDir;
  try {
    for (const attack of [
      "../secret.png",
      "..%2Fsecret.png".replace("%2F", "/"),
      "subdir/../../secret.png",
      "/etc/passwd",
      "..",
    ]) {
      const ref = await storage.searchPublicObject(attack);
      assert.equal(ref, null, `traversal "${attack}" must be rejected`);
    }
  } finally {
    if (prev === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = prev;
  }
});
