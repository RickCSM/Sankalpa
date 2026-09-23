import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';

const statusGroups: { label: string; statuses: string[]; color: string; icon: string }[] = [
  { label: 'Published (Awaiting Acceptance)', statuses: ['published'], color: '#3b82f6', icon: 'bi-send' },
  { label: 'Accepted', statuses: ['accepted'], color: '#6366f1', icon: 'bi-hand-thumbs-up' },
  { label: 'In Progress', statuses: ['in_progress'], color: '#f59e0b', icon: 'bi-arrow-repeat' },
  { label: 'Pending Completion Review', statuses: ['pending_completion_review'], color: '#8b5cf6', icon: 'bi-hourglass-split' },
  { label: 'Pending CMO Completion Review', statuses: ['pending_cmo_completion_review'], color: '#7c3aed', icon: 'bi-clipboard2-check' },
  { label: 'Reverted by Reviewer', statuses: ['reverted_by_dept_reviewer'], color: '#ef4444', icon: 'bi-arrow-counterclockwise' },
  { label: 'Completed', statuses: ['completed'], color: '#22c55e', icon: 'bi-check-circle' },
];

export default function DeptAnnouncementsByStatus() {
  const { user } = useAuth();
  const { announcements } = useAppState();
  const [, navigate] = useLocation();

  if (!user?.department) return null;

  const deptAnnouncements = announcements.filter(a => a.department === user.department);

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-list-check" style={{ marginRight: 8 }}></i>Announcements by Status</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 380, overflowY: 'auto' }}>
          {statusGroups.map(group => {
            const items = deptAnnouncements.filter(a => group.statuses.includes(a.workflowStatus));
            if (items.length === 0) return null;
            return (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '4px 0' }}>
                  <i className={`bi ${group.icon}`} style={{ color: group.color, fontSize: 14 }}></i>
                  <span style={{ fontSize: 12, fontWeight: 600, color: group.color }}>{group.label}</span>
                  <span className="portlet-badge" style={{ background: `${group.color}15`, color: group.color }}>{items.length}</span>
                </div>
                {items.slice(0, 3).map(a => (
                  <div
                    key={a.id}
                    className="portlet-list-item portlet-list-nested"
                    onClick={() => navigate(`/announcements/${a.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="portlet-list-text">{a.title.length > 50 ? a.title.substring(0, 50) + '...' : a.title}</div>
                    </div>
                  </div>
                ))}
                {items.length > 3 && (
                  <div style={{ paddingLeft: 20, fontSize: 12, color: '#6b7280' }}>+{items.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
