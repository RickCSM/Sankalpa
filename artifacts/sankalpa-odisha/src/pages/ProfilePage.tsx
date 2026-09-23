import { useRef, useState } from "react";
import {
  requestProfilePhotoUploadUrl,
  setProfilePhoto,
  removeProfilePhoto,
} from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { profilePhotoUrl } from "@/lib/profilePhoto";
import { getFriendlyErrorMessage } from "@/lib/errorMessages";
import { roleLabels } from "@/data/mockData";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function ProfilePage() {
  const { user, refreshSession } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarError, setAvatarError] = useState(false);

  const displayName = user?.name?.trim() || "User";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const photoUrl = profilePhotoUrl(user?.profileImagePath);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    setSuccess("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please choose a JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large. Maximum size is 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const { uploadURL, objectPath, uploadToken } =
        await requestProfilePhotoUploadUrl({ contentType: file.type });
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Failed to upload image.");
      await setProfilePhoto({ objectPath, uploadToken });
      setAvatarError(false);
      await refreshSession();
      setSuccess("Profile photo updated.");
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, "Could not update profile photo."));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await removeProfilePhoto();
      await refreshSession();
      setSuccess("Profile photo removed.");
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, "Could not remove profile photo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="page-container" style={{ maxWidth: 520, margin: "20px auto" }}>
      <div className="card">
        <div className="card-body">
          <h4 style={{ marginBottom: 16 }}>My Profile</h4>

          {error && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 16,
                color: "#dc2626",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 16,
                color: "#047857",
                fontSize: 13,
              }}
            >
              {success}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
            {photoUrl && !avatarError ? (
              <img
                src={photoUrl}
                alt={displayName}
                onError={() => setAvatarError(true)}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid #e5e7eb",
                }}
              />
            ) : (
              <div
                role="img"
                aria-label={displayName}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#1d4ed8",
                  color: "#fff",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  userSelect: "none",
                }}
              >
                {initials}
              </div>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{displayName}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {user ? roleLabels[user.role] : ""}
                {user?.department ? ` · ${user.department}` : ""}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Upload a JPEG or PNG image (up to 5 MB). It will appear as your
            avatar across the system. If no photo is set, your initials are
            shown instead.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFile}
            disabled={busy}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? "Working…" : user?.profileImagePath ? "Replace Photo" : "Upload Photo"}
            </button>
            {user?.profileImagePath && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={handleRemove}
              >
                Remove Photo
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
    </Layout>
  );
}
