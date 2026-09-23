import { useLocation } from 'wouter';
import type { UserRole } from '@/data/mockData';

interface QuickAction {
  label: string;
  icon: string;
  path: string;
  color: string;
}

const roleActions: Record<UserRole, QuickAction[]> = {
  admin: [
    { label: 'Manage Users', icon: 'bi-people', path: '/users', color: '#1a3a5c' },
    { label: 'Create Announcement', icon: 'bi-plus-circle', path: '/announcements/add', color: '#dc2626' },
    { label: 'View Reports', icon: 'bi-bar-chart', path: '/reports/location-wise', color: '#e67e22' },
  ],
  chief_minister: [],
  cmo_nodal: [
    { label: 'Create Announcement', icon: 'bi-plus-circle', path: '/announcements/add', color: '#dc2626' },
    { label: 'View Reports', icon: 'bi-bar-chart', path: '/reports/location-wise', color: '#6366f1' },
  ],
  cmo_reviewer: [
    { label: 'Review Pending', icon: 'bi-search', path: '/announcements?status=pending_cmo_review', color: '#7c3aed' },
    { label: 'Review Completions', icon: 'bi-clipboard2-check', path: '/announcements?status=pending_cmo_completion_review', color: '#2c5282' },
  ],
  dept_head: [],
  dept_nodal: [
    { label: 'Accept Announcements', icon: 'bi-check2-circle', path: '/announcements?status=published', color: '#16a34a' },
    { label: 'Add Sub-Component', icon: 'bi-diagram-3', path: '/announcements', color: '#2c5282' },
  ],
  dept_reviewer: [
    { label: 'Review Completions', icon: 'bi-clipboard-check', path: '/announcements?status=pending_completion_review', color: '#7c3aed' },
  ],
  dept_user: [
    { label: 'View Announcements', icon: 'bi-megaphone', path: '/announcements', color: '#0d6efd' },
  ],
  ocac_viewer: [],
  dept_viewer: [],
};

export function hasQuickActions(role: UserRole): boolean {
  const actions = roleActions[role];
  return !!actions && actions.length > 0;
}

export default function QuickActionsPanel({ role }: { role: UserRole }) {
  const [, navigate] = useLocation();
  const actions = roleActions[role];

  if (!actions || actions.length === 0) return null;

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-lightning" style={{ marginRight: 8 }}></i>Quick Actions</h4>
        </nav>
        <div className="quick-actions-grid">
          {actions.map((action, idx) => (
            <button
              key={idx}
              className="quick-action-btn"
              onClick={() => navigate(action.path)}
              style={{ '--action-color': action.color } as React.CSSProperties}
            >
              <i className={`bi ${action.icon}`}></i>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
