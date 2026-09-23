import { useMemo } from 'react';

interface AuditEntry {
  id: number;
  actorId?: number | null;
  actorName?: string | null;
  actorRole: string;
  method: string;
  route: string;
  action: string;
  targetTable: string;
  targetId?: number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
}

interface Props {
  entry: AuditEntry;
  actionLabel: string;
  roleLabel: string;
  onClose: () => void;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function topLevelKeys(value: unknown): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).sort();
  }
  return [];
}

function diffSummary(before: unknown, after: unknown): { added: string[]; removed: string[]; changed: string[] } {
  const beforeKeys = new Set(topLevelKeys(before));
  const afterKeys = new Set(topLevelKeys(after));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of afterKeys) {
    if (!beforeKeys.has(k)) {
      added.push(k);
    } else {
      const b = JSON.stringify((before as Record<string, unknown>)[k]);
      const a = JSON.stringify((after as Record<string, unknown>)[k]);
      if (b !== a) changed.push(k);
    }
  }
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) removed.push(k);
  }
  return { added, removed, changed };
}

function formatWhen(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function AuditLogDetailModal({ entry, actionLabel, roleLabel, onClose }: Props) {
  const diff = useMemo(() => diffSummary(entry.before, entry.after), [entry.before, entry.after]);

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
        background: '#fff', borderRadius: 8, width: '100%', maxWidth: 900,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <h5 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>Activity Log Entry #{entry.id}</h5>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {actionLabel} • {formatWhen(entry.createdAt)}
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

        <div style={{ padding: 18, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Field label="Actor" value={entry.actorName ?? (entry.actorId != null ? `User #${entry.actorId}` : '—')} />
            <Field label="Role" value={roleLabel} />
            <Field label="Action" value={entry.action} mono />
            <Field label="Target" value={`${entry.targetTable}${entry.targetId ? ` #${entry.targetId}` : ''}`} mono />
            <Field label="HTTP" value={`${entry.method} ${entry.route}`} mono />
            <Field label="IP" value={entry.ip ?? '—'} mono />
          </div>

          {entry.userAgent && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>User Agent</div>
              <div style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all', background: '#f8fafc', padding: '6px 10px', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                {entry.userAgent}
              </div>
            </div>
          )}

          {(diff.added.length + diff.removed.length + diff.changed.length) > 0 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#374151' }}>
              <strong>Changes: </strong>
              {diff.added.length > 0 && <span style={{ color: '#059669', marginRight: 10 }}>+{diff.added.length} added ({diff.added.join(', ')})</span>}
              {diff.changed.length > 0 && <span style={{ color: '#b45309', marginRight: 10 }}>~{diff.changed.length} changed ({diff.changed.join(', ')})</span>}
              {diff.removed.length > 0 && <span style={{ color: '#dc2626' }}>−{diff.removed.length} removed ({diff.removed.join(', ')})</span>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Panel title="Before" payload={entry.before} />
            <Panel title="After" payload={entry.after} />
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 14px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1f2937', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function Panel({ title, payload }: { title: string; payload: unknown }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{title}</div>
      <pre style={{
        margin: 0, fontSize: 12, fontFamily: 'monospace',
        background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4,
        padding: '8px 10px', maxHeight: 360, overflow: 'auto',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1f2937',
      }}>{formatJson(payload)}</pre>
    </div>
  );
}
