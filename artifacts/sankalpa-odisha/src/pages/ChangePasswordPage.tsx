import { useState } from "react";
import { useLocation } from "wouter";
import { changePassword } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { getFriendlyErrorMessage } from "@/lib/errorMessages";

export default function ChangePasswordPage() {
  const { user, refreshSession } = useAuth();
  const [, navigate] = useLocation();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mustChange = user?.mustChangePassword === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      await refreshSession();
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, "Could not change password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="page-container" style={{ maxWidth: 480, margin: "20px auto" }}>
      <div className="card">
        <div className="card-body">
          <h4 style={{ marginBottom: 8 }}>Change Password</h4>
          {mustChange && (
            <div
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 6,
                padding: "10px 12px",
                marginBottom: 16,
                color: "#92400e",
                fontSize: 13,
              }}
            >
              You logged in with a default password. Please set a new
              password to continue using the system.
            </div>
          )}
          <form onSubmit={submit}>
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
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-group">
              <label>New Password (min 8 chars)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Saving…" : "Change Password"}
              </button>
              {!mustChange && (
                <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      </div>
    </Layout>
  );
}
