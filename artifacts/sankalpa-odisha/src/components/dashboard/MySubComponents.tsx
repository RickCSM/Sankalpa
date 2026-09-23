import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { displaySubComponentStatus, type SubComponent } from '@/data/mockData';

const statusStyle: Record<string, { color: string; bg: string }> = {
  'Pending': { color: '#f59e0b', bg: '#fef3c7' },
  'In Progress': { color: '#3b82f6', bg: '#dbeafe' },
  'Completed': { color: '#22c55e', bg: '#dcfce7' },
};

const nextStatus: Record<string, SubComponent['status'] | null> = {
  'Pending': 'In Progress',
  'In Progress': 'Completed',
  'Completed': null,
};

const nextLabel: Record<string, string> = {
  'Pending': 'Start',
  'In Progress': 'Complete',
};

export default function MySubComponents() {
  const { user } = useAuth();
  const { subComponents, announcements, updateSubComponentStatus } = useAppState();
  const [, navigate] = useLocation();
  const confirm = useConfirmDialog();

  if (!user) return null;

  const isNodalOrAdmin = ['dept_nodal', 'admin'].includes(user.role);
  const mySubComponents = isNodalOrAdmin
    ? subComponents.filter(s => {
        const ann = announcements.find(a => a.id === s.announcementId);
        return ann && (s.assignedTo === user.id || (ann.department === user.department));
      })
    : subComponents.filter(s => s.assignedTo === user.id);

  // Sub-component work is only actionable once the Dept Nodal starts progress
  // (in_progress) or after a completion revert (reverted_by_dept_reviewer).
  // `accepted` is excluded — that is the Nodal's pre-start setup window.
  const activeAnnouncements = new Set(
    announcements
      .filter(a => ['in_progress', 'reverted_by_dept_reviewer'].includes(a.workflowStatus))
      .map(a => a.id)
  );

  // Only the tagged owner (or admin) may update a sub-component's status.
  const canUpdateStatusFor = (s: SubComponent) => user.role === 'admin' || s.assignedTo === user.id;

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-diagram-3" style={{ marginRight: 8 }}></i>My Sub-Components</h4>
          <span className="portlet-badge">{mySubComponents.length}</span>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {mySubComponents.length === 0 ? (
            <div className="portlet-empty">No sub-components assigned</div>
          ) : (
            mySubComponents.map(s => {
              const ann = announcements.find(a => a.id === s.announcementId);
              const displayStatus = displaySubComponentStatus(s.status, ann?.workflowStatus);
              const style = statusStyle[displayStatus] || { color: '#6b7280', bg: '#f3f4f6' };
              const next = nextStatus[displayStatus];
              const canUpdate = canUpdateStatusFor(s) && activeAnnouncements.has(s.announcementId) && next !== null;
              return (
                <div
                  key={s.id}
                  className="portlet-list-item"
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => navigate(`/announcements/${s.announcementId}`)}>
                    <div className="portlet-list-text">{s.title}</div>
                    <div className="portlet-list-meta">{ann ? ann.title.substring(0, 40) + (ann.title.length > 40 ? '...' : '') : `Announcement #${s.announcementId}`}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span className="portlet-status-badge" style={{ background: style.bg, color: style.color }}>{displayStatus}</span>
                    {canUpdate && next && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void confirm({
                            title: next === 'Completed' ? 'Mark this sub-component complete?' : 'Start this sub-component?',
                            message: `"${s.title}" will move to ${next}.`,
                            confirmLabel: next === 'Completed' ? 'Yes, Complete' : 'Yes, Start',
                            variant: 'primary',
                            onConfirm: async () => { await updateSubComponentStatus(s.id, next); },
                          });
                        }}
                        style={{
                          padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', fontWeight: 600,
                          background: next === 'Completed' ? '#16a34a' : '#2563eb', color: '#fff',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nextLabel[displayStatus]}
                      </button>
                    )}
                    {!canUpdateStatusFor(s) && next !== null && (
                      <span
                        title={`Only ${s.assignedToName || 'the assigned owner'} can update this sub-component`}
                        style={{ fontSize: 11, fontStyle: 'italic', color: '#6b7280', whiteSpace: 'nowrap' }}
                      >
                        Owner: {s.assignedToName || '—'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
