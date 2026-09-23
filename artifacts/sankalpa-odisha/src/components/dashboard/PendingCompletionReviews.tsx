import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { formatDate } from '@/data/mockData';

export default function PendingCompletionReviews() {
  const { user } = useAuth();
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  if (!user?.department) return null;

  const pending = announcements.filter(
    a => a.department === user.department && a.workflowStatus === 'pending_completion_review'
  ).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-clipboard-check" style={{ marginRight: 8 }}></i>Pending Completion Reviews</h4>
          <span className="portlet-badge" style={{ background: '#fef3c7', color: '#d97706' }}>{pending.length}</span>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {pending.length === 0 ? (
            <div className="portlet-empty">No completions pending review</div>
          ) : (
            pending.slice(0, 10).map(a => (
              <div
                key={a.id}
                className="portlet-list-item"
                onClick={() => navigate(`/announcements/${a.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <i className="bi bi-hourglass-split" style={{ color: '#8b5cf6', fontSize: 15, flexShrink: 0 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portlet-list-text">{a.title.length > 50 ? a.title.substring(0, 50) + '...' : a.title}</div>
                  <div className="portlet-list-meta">{formatDate(a.date)}</div>
                </div>
                <button
                  className="portlet-action-link"
                  onClick={(e) => { e.stopPropagation(); navigate(`/announcements/${a.id}`); }}
                >
                  Review
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
