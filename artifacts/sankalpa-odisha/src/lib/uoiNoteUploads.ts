// Shared client-side helpers for UOI note attachments.
//
// UOI notes accept PDF and JPG files only (PNG is intentionally excluded).
// The upload flow mirrors the announcement attachment flow:
//   1. request a through-server upload URL + HMAC token
//   2. PUT the raw bytes
//   3. register the object against the note

export const UOI_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const UOI_ALLOWED_EXTENSIONS = '.pdf,.jpg,.jpeg';
export const UOI_ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
]);

export function validateUoiNoteFile(file: File): string | null {
  if (!UOI_ALLOWED_TYPES.has(file.type)) {
    return 'Only PDF and JPG files are allowed.';
  }
  if (file.size > UOI_MAX_FILE_SIZE) {
    return 'File size exceeds 10MB limit.';
  }
  return null;
}

// Performs the full request-url → PUT → register sequence for a single file.
// Throws on any failure so callers can surface a friendly error.
export async function uploadUoiNoteAttachment(noteId: number, file: File): Promise<void> {
  const contentType = file.type || 'application/octet-stream';

  const tokenRes = await fetch('/api/storage/uoi-notes/uploads/request-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType,
      uoiNoteId: noteId,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Upload URL request failed (${tokenRes.status})`);
  }
  const tokenData = (await tokenRes.json()) as {
    uploadURL: string;
    objectPath: string;
    uploadToken: string;
  };

  const putRes = await fetch(tokenData.uploadURL, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const registerRes = await fetch(`/api/uoi-notes/${noteId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectPath: tokenData.objectPath,
      fileName: file.name,
      fileSize: file.size,
      contentType,
      uploadToken: tokenData.uploadToken,
    }),
  });
  if (!registerRes.ok) {
    let message = `Saving attachment failed (${registerRes.status})`;
    try {
      const body = (await registerRes.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
}
