import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(el => !el.hasAttribute('disabled'));
}

export type ConfirmVariant = 'primary' | 'danger';

export interface ConfirmOptions {
  title: string;
  message?: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm?: () => void | Promise<void>;
}

interface InternalState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirmDialog(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmDialog must be used inside <ConfirmDialogProvider>');
  return ctx.confirm;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InternalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    if (openRef.current) {
      // A dialog is already open. Refuse re-entrant calls so we never orphan a
      // Promise. Resolve immediately with false so callers can no-op safely.
      return Promise.resolve(false);
    }
    openRef.current = true;
    triggerRef.current = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
    setError('');
    setSubmitting(false);
    return new Promise<boolean>(resolve => {
      setState({ ...opts, resolve });
    });
  }, []);

  const closeWith = useCallback((ok: boolean) => {
    state?.resolve(ok);
    openRef.current = false;
    setState(null);
    setSubmitting(false);
    setError('');
    setTimeout(() => {
      try { triggerRef.current?.focus(); } catch { /* ignore */ }
    }, 0);
  }, [state]);

  const handleCancel = useCallback(() => {
    if (submitting) return;
    closeWith(false);
  }, [submitting, closeWith]);

  const handleConfirm = useCallback(async () => {
    if (!state || submitting) return;
    if (!state.onConfirm) {
      closeWith(true);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await state.onConfirm();
      closeWith(true);
    } catch (e) {
      setError(getFriendlyErrorMessage(e, 'Action failed. Please try again.'));
      setSubmitting(false);
    }
  }, [state, submitting, closeWith]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleCancel(); return; }
      if (e.key === 'Enter') {
        const tgt = e.target as HTMLElement | null;
        // Allow Enter inside textarea/select/contenteditable for normal editing.
        const tag = tgt?.tagName?.toLowerCase();
        if (tag === 'textarea' || tag === 'select' || tgt?.isContentEditable) return;
        e.preventDefault();
        handleConfirm();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = getFocusable(dialogRef.current);
        if (nodes.length === 0) { e.preventDefault(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !dialogRef.current?.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !dialogRef.current?.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { confirmBtnRef.current?.focus(); }, 30);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [state, handleCancel, handleConfirm]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={handleCancel}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            ref={dialogRef}
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 10, padding: 24, maxWidth: 460, width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <i
                className={state.variant === 'danger' ? 'bi bi-exclamation-triangle-fill' : 'bi bi-question-circle-fill'}
                style={{ fontSize: 22, color: state.variant === 'danger' ? '#dc3545' : '#1a3a5c' }}
              />
              <h4 id="confirm-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>
                {state.title}
              </h4>
            </div>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 12px', lineHeight: 1.55 }}>
              {state.message || 'Are you sure you want to proceed?'}
            </p>
            {state.details && (
              <div style={{
                fontSize: 13, color: '#1a3a5c', background: '#f1f5f9',
                borderRadius: 6, padding: '8px 12px', marginBottom: 14,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {state.details}
              </div>
            )}
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
                padding: '8px 12px', fontSize: 13, color: '#991b1b', marginBottom: 14,
              }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid #d1d5db',
                  background: '#fff', color: '#374151',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: submitting ? 0.6 : 1,
                }}
              >
                {state.cancelLabel || 'Cancel'}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: state.variant === 'danger' ? '#dc3545' : '#16a34a',
                  color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600, opacity: submitting ? 0.7 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {submitting ? (
                  <>
                    <i className="bi bi-hourglass-split" />
                    Working…
                  </>
                ) : (state.confirmLabel || 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
