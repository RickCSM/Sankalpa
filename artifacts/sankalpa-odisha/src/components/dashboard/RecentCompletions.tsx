import { useLocation } from 'wouter';
import { useAppState } from '@/context/AppStateContext';
import { formatDate } from '@/data/mockData';

export default function RecentCompletions() {
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  const completed = announcements
    .filter(a => a.workflowStatus === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-trophy" style={{ marginRight: 8 }}></i>Recent Completions</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {completed.length === 0 ? (
            <div className="portlet-empty">No completed announcements</div>
          ) : (
            completed.map(a => (
              <div
                key={a.id}
                className="portlet-list-item"
                onClick={() => navigate(`/announcements/${a.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <i className="bi bi-check-circle-fill" style={{ color: '#22c55e', fontSize: 15, flexShrink: 0 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portlet-list-text">{a.title.length > 50 ? a.title.substring(0, 50) + '...' : a.title}</div>
                  <div className="portlet-list-meta">{a.department} &middot; {formatDate(a.date)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
