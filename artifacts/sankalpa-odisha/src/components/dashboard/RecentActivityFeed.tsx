import { useLocation } from 'wouter';
import { useAppState } from '@/context/AppStateContext';

export default function RecentActivityFeed() {
  const { announcements, comments } = useAppState();
  const [, navigate] = useLocation();

  const recentComments = [...comments]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  const actionIcon: Record<string, string> = {
    'Created': 'bi-plus-circle',
    'Submitted for Review': 'bi-send',
    'Approved': 'bi-check-circle',
    'Approved & Published': 'bi-check-circle',
    'Reverted': 'bi-arrow-counterclockwise',
    'Accepted': 'bi-hand-thumbs-up',
    'Completion Requested': 'bi-flag',
    'Dept Completion Approved': 'bi-check-circle',
    'CMO Completion Approved': 'bi-trophy',
    'Completion Reverted': 'bi-arrow-counterclockwise',
    'CMO Completion Reverted': 'bi-arrow-counterclockwise',
  };

  const actionColor: Record<string, string> = {
    'Created': '#3b82f6',
    'Approved': '#22c55e',
    'Approved & Published': '#22c55e',
    'Reverted': '#f59e0b',
    'Accepted': '#6366f1',
    'Dept Completion Approved': '#22c55e',
    'CMO Completion Approved': '#16a34a',
    'Completion Reverted': '#ef4444',
    'CMO Completion Reverted': '#ef4444',
  };

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-activity" style={{ marginRight: 8 }}></i>Recent Activity</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {recentComments.length === 0 ? (
            <div className="portlet-empty">No recent activity</div>
          ) : (
            recentComments.map(c => {
              const ann = announcements.find(a => a.id === c.announcementId);
              return (
                <div
                  key={c.id}
                  className="portlet-list-item"
                  onClick={() => navigate(`/announcements/${c.announcementId}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <i className={`bi ${actionIcon[c.action] || 'bi-circle'}`} style={{ color: actionColor[c.action] || '#6b7280', fontSize: 15, flexShrink: 0, marginTop: 2 }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portlet-list-text">
                      <strong>{c.userName}</strong> {c.action.toLowerCase()} {ann ? `"${ann.title.length > 40 ? ann.title.substring(0, 40) + '...' : ann.title}"` : ''}
                    </div>
                    <div className="portlet-list-meta">{c.timestamp}</div>
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
