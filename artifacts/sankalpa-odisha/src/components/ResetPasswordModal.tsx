import { useState } from 'react';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

type ResetMode = 'generate' | 'custom';

interface Props {
  targetId: number;
  targetUsername: string;
  targetName: string;
  onClose: () => void;
  resetFn: (args: {
    id: number;
    data: { mode: 'generate' } | { mode: 'custom'; password: string };
  }) => Promise<{ password: string }>;
}

export default function ResetPasswordModal({ targetId, targetUsername, targetName, onClose, resetFn }: Props) {
  const [mode, setMode] = useState<ResetMode>('generate');
  const [customPw, setCustomPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const validateCustom = (pw: string): string => {
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      return 'Password must contain at least one letter and one digit';
    }
    if (pw.toLowerCase() === targetUsername.toLowerCase()) {
      return 'Password cannot equal the username';
    }
    return '';
  };

  const handleSubmit = async () => {
    setError('');
    if (mode === 'custom') {
      const v = validateCustom(customPw);
      if (v) { setError(v); return; }
    }
    setSubmitting(true);
    try {
      const data =
        mode === 'generate'
          ? ({ mode: 'generate' } as const)
          : ({ mode: 'custom', password: customPw } as const);
      const result = await resetFn({ id: targetId, data });
      setIssuedPassword(result.password);
      setCustomPw('');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not reset the password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!issuedPassword) return;
    try {
      await navigator.clipboard.writeText(issuedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text element
      const el = document.getElementById('issued-password-value');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 8, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <h5 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>Reset Password</h5>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              for <strong>{targetName}</strong> <span style={{ color: '#9ca3af' }}>({targetUsername})</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {!issuedPassword && (
            <>
              <p style={{ fontSize: 13, color: '#374151', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
                Pick how the new password should be set. The user will be required to change it the next time they sign in.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="reset-mode" value="generate" checked={mode === 'generate'} onChange={() => setMode('generate')} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: '#1f2937' }}>Generate a temporary password</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>The system creates a random 12-character password.</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="reset-mode" value="custom" checked={mode === 'custom'} onChange={() => setMode('custom')} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1f2937' }}>Set a specific password</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>Min 8 characters, must contain a letter and a digit, cannot equal the username.</div>
                    {mode === 'custom' && (
                      <input
                        type="text"
                        value={customPw}
                        onChange={(e) => setCustomPw(e.target.value)}
                        placeholder="Enter new password"
                        autoFocus
                        style={{
                          marginTop: 8, width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
                          borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
                        }}
                      />
                    )}
                  </div>
                </label>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={onClose}
                  disabled={submitting}
                  style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: '#374151' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (mode === 'custom' && !customPw)}
                  style={{ padding: '8px 14px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: submitting || (mode === 'custom' && !customPw) ? 0.6 : 1 }}
                >
                  {submitting ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </>
          )}

          {issuedPassword && (
            <>
              <div style={{
                background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6,
                padding: '10px 12px', marginBottom: 14, color: '#92400e', fontSize: 13, lineHeight: 1.5,
              }}>
                <strong>Copy this password now.</strong> It is shown only once and is not stored anywhere we can read. Share it with the user through a secure channel.
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6,
                padding: '10px 12px', marginBottom: 12,
              }}>
                <code id="issued-password-value" style={{ flex: 1, fontFamily: 'monospace', fontSize: 15, color: '#0f172a', userSelect: 'all', wordBreak: 'break-all' }}>
                  {issuedPassword}
                </code>
                <button
                  onClick={handleCopy}
                  style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-clipboard" style={{ marginRight: 4 }}></i>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                When <strong>{targetUsername}</strong> next signs in they will be required to change this password before they can use the app.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{ padding: '8px 14px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
