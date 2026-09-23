import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { roleLabels } from '@/data/mockData';
import type { UserRole } from '@/data/mockData';

export default function DepartmentTeam() {
  const { user } = useAuth();
  const { users } = useAppState();

  if (!user?.department) return null;

  const teamMembers = users.filter(
    u => u.department === user.department && ['dept_nodal', 'dept_reviewer', 'dept_viewer'].includes(u.role)
  );

  const roleIcon: Record<string, string> = {
    dept_nodal: 'bi-person-badge',
    dept_reviewer: 'bi-person-check',
    dept_viewer: 'bi-eye',
    ocac_viewer: 'bi-binoculars',
  };

  const roleColor: Record<string, string> = {
    dept_nodal: '#2563eb',
    dept_reviewer: '#7c3aed',
    dept_viewer: '#0891b2',
    ocac_viewer: '#0891b2',
  };

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-people" style={{ marginRight: 8 }}></i>Department Team</h4>
        </nav>
        <div className="portlet-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
          {teamMembers.length === 0 ? (
            <div className="portlet-empty">No team members found</div>
          ) : (
            teamMembers.map(m => (
              <div key={m.id} className="portlet-list-item" style={{ cursor: 'default' }}>
                <i className={`bi ${roleIcon[m.role] || 'bi-person'}`} style={{ color: roleColor[m.role] || '#6b7280', fontSize: 16 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portlet-list-text">{m.name}</div>
                  <div className="portlet-list-meta">{roleLabels[m.role as UserRole]} &middot; {m.email}</div>
                </div>
                <span className={`portlet-status-dot ${m.status === 'Active' ? 'active' : 'inactive'}`}></span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
