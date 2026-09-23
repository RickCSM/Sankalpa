import { useMemo, useState } from 'react';
import type { PendingActivity, EligibleAssignee } from '@workspace/api-client-react';
import { getFriendlyErrorMessage } from '@/lib/errorMessages';

interface Props {
  targetName: string;
  /** What happens after every pending activity has been reassigned. */
  action: 'deactivate' | 'delete';
  pendingActivities: PendingActivity[];
  eligibleAssignees: EligibleAssignee[];
  /** Reassign the chosen activities, then perform the deactivate/delete. */
  onConfirm: (assignments: { subComponentId: number; newAssignedTo: number }[]) => Promise<void>;
  onCancel: () => void;
}

export default function ReassignActivitiesModal({
  targetName,
  action,
  pendingActivities,
  eligibleAssignees,
  onConfirm,
  onCancel,
}: Props) {
  // Per-activity selected new assignee. '' means "not yet chosen".
  const [picks, setPicks] = useState<Record<number, number | ''>>(() =>
    Object.fromEntries(pendingActivities.map((a) => [a.subComponentId, '' as const])),
  );
  const [bulkPick, setBulkPick] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const actionLabel = action === 'delete' ? 'Delete' : 'Deactivate';

  // Candidates are department-scoped: each activity can only be handed to an
  // active executor in that activity's announcement department.
  const candidatesFor = (deptId: number | null): EligibleAssignee[] =>
    eligibleAssignees.filter((u) => u.departmentId === deptId);

  // Activities that have no possible assignee at all block the whole removal.
  const blockedActivities = useMemo(
    () => pendingActivities.filter((a) => candidatesFor(a.departmentId).length === 0),
    [pendingActivities, eligibleAssignees],
  );
  const noCandidates = blockedActivities.length > 0;

  // The "assign all to" shortcut only makes sense when every activity shares one
  // department (a person belongs to a single department), so one pick can cover
  // them all.
  const sharedDeptId = useMemo(() => {
    const ids = new Set(pendingActivities.map((a) => a.departmentId));
    return ids.size === 1 ? pendingActivities[0]?.departmentId ?? null : undefined;
  }, [pendingActivities]);
  const bulkCandidates = sharedDeptId === undefined ? [] : candidatesFor(sharedDeptId);
  const showBulk = bulkCandidates.length > 0;

  const unassignedCount = useMemo(
    () => pendingActivities.filter((a) => !picks[a.subComponentId]).length,
    [pendingActivities, picks],
  );

  const applyBulk = (val: number | '') => {
    setBulkPick(val);
    if (val === '') return;
    setPicks(Object.fromEntries(pendingActivities.map((a) => [a.subComponentId, val])));
  };

  const handleSubmit = async () => {
    setError('');
    const assignments = pendingActivities.map((a) => ({
      subComponentId: a.subComponentId,
      newAssignedTo: picks[a.subComponentId],
    }));
    if (assignments.some((x) => x.newAssignedTo === '')) {
      setError('Choose a new assignee for every activity before continuing.');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(assignments as { subComponentId: number; newAssignedTo: number }[]);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not reassign the activities. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 8, width: '100%', maxWidth: 680,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h5 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a3a5c' }}>Reassign Activities Before {actionLabel}</h5>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              <strong>{targetName}</strong> still has {pendingActivities.length} pending {pendingActivities.length === 1 ? 'activity' : 'activities'}.
            </div>
          </div>
          <button
            onClick={() => { if (!submitting) onCancel(); }}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: '#374151', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
            Each pending activity must be handed to another active department user before {targetName} can be {action === 'delete' ? 'deleted' : 'deactivated'}. You can send them all to one person or split them across several.
          </p>

          {noCandidates && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 12px', marginBottom: 14, color: '#dc2626', fontSize: 13, lineHeight: 1.5 }}>
              {blockedActivities.length} {blockedActivities.length === 1 ? 'activity has' : 'activities have'} no other active user in its department to take over. Add or activate a department user there first, then try again.
            </div>
          )}

          {showBulk && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Assign all to:</span>
              <select
                value={bulkPick}
                onChange={(e) => applyBulk(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, minWidth: 220 }}
              >
                <option value="">— choose a person —</option>
                {bulkCandidates.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: '#6b7280' }}>(you can still fine-tune each row below)</span>
            </div>
          )}

              <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>Activity</th>
                      <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>Announcement</th>
                      <th style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', minWidth: 200 }}>Reassign to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingActivities.map((a) => (
                      <tr key={a.subComponentId}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#1f2937' }}>
                          {a.title}
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{a.status}</div>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>
                          {a.announcementTitle}
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.announcementUniqueId}</div>
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                          {candidatesFor(a.departmentId).length === 0 ? (
                            <span style={{ fontSize: 12, color: '#dc2626' }}>No other active user in this department</span>
                          ) : (
                            <select
                              value={picks[a.subComponentId] ?? ''}
                              onChange={(e) => setPicks((p) => ({ ...p, [a.subComponentId]: e.target.value === '' ? '' : Number(e.target.value) }))}
                              style={{
                                width: '100%', padding: '6px 8px', borderRadius: 4, fontSize: 13,
                                border: picks[a.subComponentId] ? '1px solid #d1d5db' : '1px solid #fca5a5',
                              }}
                            >
                              <option value="">— choose a person —</option>
                              {candidatesFor(a.departmentId).map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginTop: 14, color: '#dc2626', fontSize: 13 }}>
                  {error}
                </div>
              )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {noCandidates ? '' : `${unassignedCount} of ${pendingActivities.length} still need a person`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (!submitting) onCancel(); }}
              disabled={submitting}
              style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: '#374151' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || noCandidates || unassignedCount > 0}
              style={{
                padding: '8px 14px', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                background: action === 'delete' ? '#dc2626' : '#1a3a5c',
                cursor: submitting || noCandidates || unassignedCount > 0 ? 'not-allowed' : 'pointer',
                opacity: submitting || noCandidates || unassignedCount > 0 ? 0.6 : 1,
              }}
            >
              {submitting ? 'Working…' : `Reassign & ${actionLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
