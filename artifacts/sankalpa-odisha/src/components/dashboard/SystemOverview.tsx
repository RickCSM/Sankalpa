import { useAppState } from '@/context/AppStateContext';
import { roleLabels } from '@/data/mockData';
import type { UserRole } from '@/data/mockData';

export default function SystemOverview() {
  const { users } = useAppState();

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'Active').length;
  const inactiveUsers = users.filter(u => u.status === 'Inactive').length;

  const roleBreakdown = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-people" style={{ marginRight: 8 }}></i>System Overview</h4>
        </nav>
        <div className="system-overview-grid">
          <div className="system-stat">
            <div className="system-stat-value">{totalUsers}</div>
            <div className="system-stat-label">Total Users</div>
          </div>
          <div className="system-stat">
            <div className="system-stat-value" style={{ color: '#22c55e' }}>{activeUsers}</div>
            <div className="system-stat-label">Active</div>
          </div>
          <div className="system-stat">
            <div className="system-stat-value" style={{ color: '#ef4444' }}>{inactiveUsers}</div>
            <div className="system-stat-label">Inactive</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#555' }}>Users by Role</div>
          <div className="portlet-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
            {Object.entries(roleBreakdown).map(([role, count]) => (
              <div key={role} className="portlet-list-item" style={{ cursor: 'default' }}>
                <i className="bi bi-person" style={{ color: '#1a3a5c', fontSize: 14 }}></i>
                <div style={{ flex: 1 }}>
                  <span className="portlet-list-text">{roleLabels[role as UserRole] || role}</span>
                </div>
                <span className="portlet-badge">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
