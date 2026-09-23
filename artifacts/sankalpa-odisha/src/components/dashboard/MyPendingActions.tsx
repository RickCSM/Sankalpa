import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { formatDate } from '@/data/mockData';

export default function MyPendingActions() {
  const { user } = useAuth();
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  if (!user?.department) return null;

  const needsAcceptance = announcements.filter(
    a => a.department === user.department && a.workflowStatus === 'published'
  );

  const needsRework = announcements.filter(
    a => a.department === user.department && a.workflowStatus === 'reverted_by_dept_reviewer'
  );

  const totalPending = needsAcceptance.length + needsRework.length;

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-exclamation-diamond" style={{ marginRight: 8 }}></i>My Pending Actions</h4>
          {totalPending > 0 && (
            <span className="portlet-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>{totalPending}</span>
          )}
        </nav>
        <div className="portlet-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
          {needsAcceptance.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 0' }}>
                <i className="bi bi-send" style={{ color: '#3b82f6', fontSize: 14 }}></i>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>Needs Acceptance</span>
                <span className="portlet-badge" style={{ background: '#dbeafe', color: '#2563eb' }}>{needsAcceptance.length}</span>
              </div>
              {needsAcceptance.slice(0, 5).map(a => (
                <div
                  key={a.id}
                  className="portlet-list-item portlet-list-nested"
                  onClick={() => navigate(`/announcements/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portlet-list-text">{a.title.length > 45 ? a.title.substring(0, 45) + '...' : a.title}</div>
                    <div className="portlet-list-meta">{formatDate(a.date)}</div>
                  </div>
                  <button className="portlet-action-link" onClick={(e) => { e.stopPropagation(); navigate(`/announcements/${a.id}`); }}>Accept</button>
                </div>
              ))}
              {needsAcceptance.length > 5 && (
                <div style={{ paddingLeft: 20, fontSize: 12, color: '#6b7280' }}>+{needsAcceptance.length - 5} more</div>
              )}
            </div>
          )}
          {needsRework.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 0' }}>
                <i className="bi bi-arrow-counterclockwise" style={{ color: '#ef4444', fontSize: 14 }}></i>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>Needs Rework</span>
                <span className="portlet-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>{needsRework.length}</span>
              </div>
              {needsRework.slice(0, 5).map(a => (
                <div
                  key={a.id}
                  className="portlet-list-item portlet-list-nested"
                  onClick={() => navigate(`/announcements/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portlet-list-text">{a.title.length > 45 ? a.title.substring(0, 45) + '...' : a.title}</div>
                    <div className="portlet-list-meta">{formatDate(a.date)}</div>
                  </div>
                  <button className="portlet-action-link" onClick={(e) => { e.stopPropagation(); navigate(`/announcements/${a.id}`); }}>Rework</button>
                </div>
              ))}
            </div>
          )}
          {totalPending === 0 && (
            <div className="portlet-empty">No pending actions</div>
          )}
        </div>
      </div>
    </div>
  );
}
