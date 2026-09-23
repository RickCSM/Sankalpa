import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { formatDate } from '@/data/mockData';

const statusLabel: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#6b7280' },
  pending_cmo_review: { label: 'Pending Review', color: '#f59e0b' },
  reverted_by_cmo: { label: 'Reverted', color: '#ef4444' },
  pending_cmo_reconsideration: { label: 'Reconsider Requested', color: '#ea580c' },
  published: { label: 'Published', color: '#3b82f6' },
  accepted: { label: 'Accepted', color: '#6366f1' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  pending_completion_review: { label: 'Completion Review', color: '#8b5cf6' },
  reverted_by_dept_reviewer: { label: 'Dept Reverted', color: '#ef4444' },
  pending_cmo_completion_review: { label: 'CMO Review', color: '#7c3aed' },
  completed: { label: 'Completed', color: '#22c55e' },
  dropped: { label: 'Dropped', color: '#dc2626' },
  on_hold: { label: 'On Hold', color: '#d97706' },
};

export default function MyCreatedAnnouncements() {
  const { user } = useAuth();
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  if (!user) return null;

  const myAnnouncements = announcements
    .filter(a => a.createdBy === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const pendingReviewCount = announcements.filter(a => a.workflowStatus === 'pending_cmo_review').length;

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-megaphone" style={{ marginRight: 8 }}></i>My Created Announcements</h4>
          <span className="portlet-badge" style={{ background: '#fef3c7', color: '#d97706' }}>
            {pendingReviewCount} awaiting review
          </span>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {myAnnouncements.length === 0 ? (
            <div className="portlet-empty">No announcements created yet</div>
          ) : (
            myAnnouncements.map(a => {
              const status = statusLabel[a.workflowStatus] || { label: a.workflowStatus, color: '#6b7280' };
              return (
                <div
                  key={a.id}
                  className="portlet-list-item"
                  onClick={() => navigate(`/announcements/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portlet-list-text">{a.title.length > 50 ? a.title.substring(0, 50) + '...' : a.title}</div>
                    <div className="portlet-list-meta">{a.department} &middot; {formatDate(a.date)}</div>
                  </div>
                  <span className="portlet-status-badge" style={{ background: `${status.color}15`, color: status.color, borderColor: `${status.color}40` }}>{status.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
