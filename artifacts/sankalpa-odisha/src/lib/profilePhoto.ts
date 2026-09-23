/**
 * Build the URL used to stream the current user's profile photo.
 *
 * The image is served by the API at GET /api/auth/profile-photo (session
 * cookie sent automatically by the browser). `objectPath` is included as a
 * cache-busting `v` query param so the avatar refreshes the moment a user
 * uploads or replaces their photo. Returns null when no photo is set.
 */
export function profilePhotoUrl(objectPath?: string | null): string | null {
  if (!objectPath) return null;
  return `/api/auth/profile-photo?v=${encodeURIComponent(objectPath)}`;
}
