import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

const CONFIRM_PHRASE = 'DELETE ALL DATA';

interface ClearedCounts {
  announcements: number;
  subComponents: number;
  comments: number;
  notifications: number;
  attachments: number;
  auditLog: number;
}

type StepState = 'waiting' | 'running' | 'done' | 'error';

interface Step {
  key: keyof ClearedCounts;
  label: string;
}

const STEPS: Step[] = [
  { key: 'attachments', label: 'Attachments' },
  { key: 'comments', label: 'Comments' },
  { key: 'subComponents', label: 'Sub-components' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'auditLog', label: 'Audit log' },
];

const STEP_DELAY_MS = 320;

export default function FlushUsersPage() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [phrase, setPhrase] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [stepStates, setStepStates] = useState<StepState[]>(STEPS.map(() => 'waiting'));
  const [cleared, setCleared] = useState<ClearedCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const phraseMatches = phrase === CONFIRM_PHRASE;
  const isAdmin = isAuthenticated && user?.role === 'admin';

  const apiCallStarted = useRef(false);

  async function startReset() {
    if (!phraseMatches || !isAdmin) return;
    setShowModal(true);
    setStepStates(STEPS.map(() => 'waiting'));
    setCleared(null);
    setError(null);
    setDone(false);
    apiCallStarted.current = false;
  }

  useEffect(() => {
    if (!showModal) return;
    if (apiCallStarted.current) return;
    apiCallStarted.current = true;

    let cancelled = false;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    async function run() {
      // Fire the API call immediately so it runs in parallel with the animation.
      const apiPromise = fetch('/api/admin/factory-reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }).then(async (res) => {
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          // Carry status + body so the catch can craft a friendly message.
          throw Object.assign(new Error('Factory reset failed'), {
            status: res.status,
            data: body,
          });
        }
        return res.json() as Promise<{ cleared: ClearedCounts }>;
      });

      // Phase 1 — animate each step to 'running' sequentially.
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return;
        setStepStates((prev) => {
          const next = [...prev] as StepState[];
          next[i] = 'running';
          return next;
        });
        if (i < STEPS.length - 1) await delay(STEP_DELAY_MS);
      }

      // Phase 2 — await the actual API result now that the animation is running.
      let data: { cleared: ClearedCounts };
      try {
        data = await apiPromise;
      } catch (err: unknown) {
        if (cancelled) return;
        const message = getFriendlyErrorMessage(err, 'Could not reset the system. Please try again.');
        setError(message);
        setStepStates((prev) =>
          prev.map((s): StepState => (s === 'running' ? 'error' : s)),
        );
        return;
      }

      if (cancelled) return;

      // Phase 3 — sequentially flip each step from 'running' to 'done'.
      for (let i = 0; i < STEPS.length; i++) {
        if (cancelled) return;
        setStepStates((prev) => {
          const next = [...prev] as StepState[];
          next[i] = 'done';
          return next;
        });
        await delay(150);
      }

      if (cancelled) return;
      setCleared(data.cleared);
      setDone(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [showModal]);

  return (
    <Layout>
    <div style={{ minHeight: 'calc(100vh - var(--header-height))', background: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dc3545', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, color: '#1a1a2e' }}>Factory Reset</div>
            <div style={{ fontSize: 13, color: '#6c757d' }}>Sankalpa Odisha — Admin tool</div>
          </div>
        </div>

        {/* Not-admin guard */}
        {!isAuthenticated ? (
          <div className="card" style={{ border: '1.5px solid #dee2e6', borderRadius: 10 }}>
            <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
              <i className="bi bi-lock-fill" style={{ fontSize: 32, color: '#6c757d', display: 'block', marginBottom: 12 }} />
              <div style={{ fontWeight: 600, marginBottom: 6 }}>You are not logged in</div>
              <div style={{ color: '#6c757d', fontSize: 13, marginBottom: 18 }}>Sign in as the System Administrator to access this tool.</div>
              <button className="btn btn-primary" onClick={() => navigate('/login')}>Go to Login</button>
            </div>
          </div>
        ) : !isAdmin ? (
          <div className="card" style={{ border: '1.5px solid #dee2e6', borderRadius: 10 }}>
            <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
              <i className="bi bi-shield-x" style={{ fontSize: 32, color: '#dc3545', display: 'block', marginBottom: 12 }} />
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Access Denied</div>
              <div style={{ color: '#6c757d', fontSize: 13, marginBottom: 18 }}>This tool is restricted to the System Administrator account.</div>
              <button className="btn btn-secondary" onClick={() => navigate('/')}>Back to Dashboard</button>
            </div>
          </div>
        ) : (

          /* Main reset card */
          <div className="card" style={{ border: '1.5px solid #f5c6cb', borderRadius: 10, boxShadow: '0 2px 12px rgba(220,53,69,0.08)' }}>
            <div style={{ background: '#fff3f4', borderBottom: '1px solid #f5c6cb', borderRadius: '10px 10px 0 0', padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ color: '#dc3545', fontSize: 16, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#842029', fontSize: 14 }}>This action is irreversible</div>
                <div style={{ color: '#842029', fontSize: 13, marginTop: 3 }}>
                  All announcements, sub-components, comments, notifications, attachments, and audit log entries will be permanently deleted.
                  User accounts, departments, categories, and tags are preserved.
                </div>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1.5rem 1.25rem' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>What will be cleared</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#495057', fontSize: 13, lineHeight: 1.8 }}>
                  <li>All HCM Announcements (+ sub-components, comments, attachments)</li>
                  <li>All notifications</li>
                  <li>Entire audit log</li>
                  <li>CMO round-robin assignment pointer</li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 6 }}>
                  Type <span style={{ fontFamily: 'monospace', background: '#f8d7da', padding: '0 4px', borderRadius: 3 }}>{CONFIRM_PHRASE}</span> to confirm
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                />
              </div>

              <button
                className="btn btn-danger w-100"
                style={{ fontWeight: 600 }}
                disabled={!phraseMatches}
                onClick={startReset}
              >
                <i className="bi bi-trash3-fill" style={{ marginRight: 8 }} />
                Start Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1rem',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 460, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #dee2e6', display: 'flex', alignItems: 'center', gap: 10 }}>
              {done ? (
                <i className="bi bi-check-circle-fill" style={{ color: '#198754', fontSize: 22 }} />
              ) : error ? (
                <i className="bi bi-x-circle-fill" style={{ color: '#dc3545', fontSize: 22 }} />
              ) : (
                <div className="spinner-border spinner-border-sm text-danger" role="status" style={{ width: 20, height: 20 }} />
              )}
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {done ? 'Factory Reset Complete' : error ? 'Reset Failed' : 'Clearing Data…'}
              </span>
            </div>

            {/* Steps */}
            <div style={{ padding: '16px 20px' }}>
              {STEPS.map((step, i) => {
                const state = stepStates[i]!;
                return (
                  <div
                    key={step.key}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 0',
                      borderBottom: i < STEPS.length - 1 ? '1px solid #f0f0f0' : 'none',
                      opacity: state === 'waiting' ? 0.45 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {state === 'waiting' && (
                        <i className="bi bi-circle" style={{ color: '#adb5bd', fontSize: 15 }} />
                      )}
                      {state === 'running' && (
                        <div className="spinner-border spinner-border-sm text-primary" role="status" style={{ width: 15, height: 15 }} />
                      )}
                      {state === 'done' && (
                        <i className="bi bi-check-circle-fill" style={{ color: '#198754', fontSize: 15 }} />
                      )}
                      {state === 'error' && (
                        <i className="bi bi-x-circle-fill" style={{ color: '#dc3545', fontSize: 15 }} />
                      )}
                      <span style={{ fontSize: 14, fontWeight: state === 'running' ? 600 : 400 }}>
                        {step.label}
                      </span>
                    </div>

                    {/* Count badge on success */}
                    {state === 'done' && cleared && (
                      <span style={{
                        background: '#d1e7dd', color: '#0a3622',
                        borderRadius: 12, padding: '1px 10px', fontSize: 12, fontWeight: 600,
                      }}>
                        {cleared[step.key] ?? 0} cleared
                      </span>
                    )}
                    {state === 'running' && (
                      <span style={{ color: '#6c757d', fontSize: 12 }}>processing…</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px 18px', borderTop: '1px solid #dee2e6' }}>
              {done && (
                <>
                  <div style={{ fontSize: 13, color: '#198754', fontWeight: 500, marginBottom: 12, textAlign: 'center' }}>
                    All transactional data has been wiped. The system is ready for a fresh start.
                  </div>
                  <button
                    className="btn btn-success w-100"
                    style={{ fontWeight: 600 }}
                    onClick={() => navigate('/')}
                  >
                    Done — Go to Dashboard
                  </button>
                </>
              )}
              {error && (
                <>
                  <div style={{ background: '#f8d7da', borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#842029' }}>
                    <strong>Error:</strong> {error}
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      The reset may be partially complete. Check the database for consistency before retrying.
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary w-100"
                    onClick={() => {
                      setShowModal(false);
                      setPhrase('');
                    }}
                  >
                    Close
                  </button>
                </>
              )}
              {!done && !error && (
                <div style={{ fontSize: 12, color: '#6c757d', textAlign: 'center' }}>
                  Do not close this window while the reset is in progress.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </Layout>
  );
}
