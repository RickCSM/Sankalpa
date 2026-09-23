import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production for upload tokens.");
  }
  return "sankalpa-dev-only-secret-do-not-use-in-prod";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function mintUploadToken(
  actorId: number,
  announcementId: number,
  objectPath: string,
): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${actorId}.${announcementId}.${objectPath}.${exp}`;
  const sig = sign(payload);
  return `${exp}.${sig}`;
}

// ---------------------------------------------------------------------------
// Profile-photo upload tokens
//
// Profile photos are not tied to an announcement, so they use a token that
// binds only {actorId, objectPath}. This still prevents a user from
// finalizing a profile photo against an object that someone else uploaded
// (e.g. a private announcement attachment), which would otherwise leak that
// file through the profile-photo serve endpoint.
// ---------------------------------------------------------------------------
export function mintProfilePhotoToken(actorId: number, objectPath: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `profile.${actorId}.${objectPath}.${exp}`;
  const sig = sign(payload);
  return `${exp}.${sig}`;
}

export function verifyProfilePhotoToken(
  token: string,
  actorId: number,
  objectPath: string,
): { ok: true } | { ok: false; reason: string } {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "Malformed upload token" };
  }
  const idx = token.indexOf(".");
  const expStr = token.slice(0, idx);
  const sigGiven = token.slice(idx + 1);
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp <= 0) return { ok: false, reason: "Bad token expiry" };
  if (Date.now() > exp) return { ok: false, reason: "Upload token expired" };
  const expected = sign(`profile.${actorId}.${objectPath}.${exp}`);
  const a = Buffer.from(sigGiven);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid upload token" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// UOI Note attachment upload tokens
//
// UOI notes are a separate workflow from announcements, so they use a token
// that binds {actorId, noteId, objectPath} with a distinct "uoinote." prefix.
// The prefix guarantees a token minted for one surface (announcement / profile
// / note) cannot be replayed against another.
// ---------------------------------------------------------------------------
export function mintUoiNoteUploadToken(
  actorId: number,
  noteId: number,
  objectPath: string,
): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `uoinote.${actorId}.${noteId}.${objectPath}.${exp}`;
  const sig = sign(payload);
  return `${exp}.${sig}`;
}

export function verifyUoiNoteUploadToken(
  token: string,
  actorId: number,
  noteId: number,
  objectPath: string,
): { ok: true } | { ok: false; reason: string } {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "Malformed upload token" };
  }
  const idx = token.indexOf(".");
  const expStr = token.slice(0, idx);
  const sigGiven = token.slice(idx + 1);
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp <= 0) return { ok: false, reason: "Bad token expiry" };
  if (Date.now() > exp) return { ok: false, reason: "Upload token expired" };
  const expected = sign(`uoinote.${actorId}.${noteId}.${objectPath}.${exp}`);
  const a = Buffer.from(sigGiven);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid upload token" };
  }
  return { ok: true };
}

export function verifyUploadToken(
  token: string,
  actorId: number,
  announcementId: number,
  objectPath: string,
): { ok: true } | { ok: false; reason: string } {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "Malformed upload token" };
  }
  const idx = token.indexOf(".");
  const expStr = token.slice(0, idx);
  const sigGiven = token.slice(idx + 1);
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp <= 0) return { ok: false, reason: "Bad token expiry" };
  if (Date.now() > exp) return { ok: false, reason: "Upload token expired" };
  const expected = sign(`${actorId}.${announcementId}.${objectPath}.${exp}`);
  const a = Buffer.from(sigGiven);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Invalid upload token" };
  }
  return { ok: true };
}
