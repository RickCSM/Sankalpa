import { useLocation } from 'wouter';
import { useAppState } from '@/context/AppStateContext';
import { formatDate } from '@/data/mockData';

export default function PendingCMOCompletionReviews() {
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  const pending = announcements
    .filter(a => a.workflowStatus === 'pending_cmo_completion_review')
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-clipboard2-check" style={{ marginRight: 8 }}></i>CMO Completion Reviews</h4>
          <span className="portlet-badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>{pending.length}</span>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {pending.length === 0 ? (
            <div className="portlet-empty">No completions pending CMO review</div>
          ) : (
            pending.slice(0, 10).map(a => (
              <div
                key={a.id}
                className="portlet-list-item"
                onClick={() => navigate(`/announcements/${a.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <i className="bi bi-hourglass-split" style={{ color: '#7c3aed', fontSize: 15, flexShrink: 0 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portlet-list-text">{a.title.length > 50 ? a.title.substring(0, 50) + '...' : a.title}</div>
                  <div className="portlet-list-meta">{a.department} &middot; {formatDate(a.date)}</div>
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
