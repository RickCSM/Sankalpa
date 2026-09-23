import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';

export default function NotificationsPanel() {
  const { user } = useAuth();
  const { notifications, markNotificationRead } = useAppState();
  const [, navigate] = useLocation();

  if (!user) return null;

  const myNotifications = notifications
    .filter(n => n.userId === user.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);

  const typeIcon: Record<string, string> = {
    info: 'bi-info-circle-fill',
    success: 'bi-check-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
  };

  const typeColor: Record<string, string> = {
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
  };

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-bell" style={{ marginRight: 8 }}></i>Notifications</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {myNotifications.length === 0 ? (
            <div className="portlet-empty">No notifications</div>
          ) : (
            myNotifications.map(n => (
              <div
                key={n.id}
                className={`portlet-list-item ${!n.read ? 'portlet-unread' : ''}`}
                onClick={() => {
                  markNotificationRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                style={{ cursor: n.link ? 'pointer' : 'default' }}
              >
                <i className={typeIcon[n.type] || 'bi-info-circle'} style={{ color: typeColor[n.type] || '#3b82f6', fontSize: 16, flexShrink: 0, marginTop: 2 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portlet-list-text">{n.message}</div>
                  <div className="portlet-list-meta">{n.timestamp}</div>
                </div>
                {!n.read && <span className="portlet-unread-dot"></span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
