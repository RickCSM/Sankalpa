import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';

export default function RecentlyReviewed({ scope }: { scope: 'cmo' | 'dept' }) {
  const { user } = useAuth();
  const { announcements, comments } = useAppState();
  const [, navigate] = useLocation();

  if (!user) return null;

  const reviewActions = scope === 'cmo'
    ? ['Approved', 'Approved & Published', 'Reverted', 'CMO Completion Approved', 'CMO Completion Reverted']
    : ['Dept Completion Approved', 'Completion Reverted'];

  const myReviewComments = comments
    .filter(c => c.userId === user.id && reviewActions.includes(c.action))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  const actionStyle: Record<string, { icon: string; color: string }> = {
    'Approved': { icon: 'bi-check-circle-fill', color: '#22c55e' },
    'Approved & Published': { icon: 'bi-check-circle-fill', color: '#22c55e' },
    'Reverted': { icon: 'bi-arrow-counterclockwise', color: '#ef4444' },
    'Dept Completion Approved': { icon: 'bi-check-circle-fill', color: '#22c55e' },
    'Completion Reverted': { icon: 'bi-arrow-counterclockwise', color: '#ef4444' },
    'CMO Completion Approved': { icon: 'bi-trophy-fill', color: '#22c55e' },
    'CMO Completion Reverted': { icon: 'bi-arrow-counterclockwise', color: '#ef4444' },
  };

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-clock-history" style={{ marginRight: 8 }}></i>Recently Reviewed</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {myReviewComments.length === 0 ? (
            <div className="portlet-empty">No reviews yet</div>
          ) : (
            myReviewComments.map(c => {
              const ann = announcements.find(a => a.id === c.announcementId);
              const style = actionStyle[c.action] || { icon: 'bi-circle', color: '#6b7280' };
              return (
                <div
                  key={c.id}
                  className="portlet-list-item"
                  onClick={() => navigate(`/announcements/${c.announcementId}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <i className={`bi ${style.icon}`} style={{ color: style.color, fontSize: 15, flexShrink: 0 }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portlet-list-text">{ann ? (ann.title.length > 45 ? ann.title.substring(0, 45) + '...' : ann.title) : `Announcement #${c.announcementId}`}</div>
                    <div className="portlet-list-meta">{c.action} &middot; {c.timestamp}</div>
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
