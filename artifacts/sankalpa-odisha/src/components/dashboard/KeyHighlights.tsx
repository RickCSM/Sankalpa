import { useMemo } from 'react';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { departmentList } from '@/data/mockData';
import { filterVisibleAnnouncements } from '@/data/mockData';

export default function KeyHighlights() {
  const { announcements, deptStats } = useAppState();
  const { user } = useAuth();

  const visible = useMemo(() => filterVisibleAnnouncements(announcements, user?.id), [announcements, user?.id]);

  const completedThisMonth = visible.filter(a => {
    if (a.workflowStatus !== 'completed') return false;
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return a.date.startsWith(monthStr);
  }).length;

  const totalCompleted = visible.filter(a => a.workflowStatus === 'completed').length;

  const pendingAction = visible.filter(a =>
    ['pending_cmo_review', 'pending_completion_review', 'pending_cmo_completion_review', 'published'].includes(a.workflowStatus)
  ).length;

  const districtCoverage = new Set(visible.filter(a => a.district).map(a => a.district)).size;

  const totalDepartments = departmentList.length;
  const deptsWithAnnouncements = useMemo(
    () => Object.values(deptStats).filter(s => s.total > 0).length,
    [deptStats],
  );

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-star" style={{ marginRight: 8 }}></i>Key Highlights</h4>
        </nav>
        <div className="highlights-grid">
          <div className="highlight-item">
            <div className="highlight-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <i className="bi bi-check-circle"></i>
            </div>
            <div>
              <div className="highlight-value">{completedThisMonth}</div>
              <div className="highlight-label">Completed This Month</div>
            </div>
          </div>
          <div className="highlight-item">
            <div className="highlight-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
              <i className="bi bi-hourglass-split"></i>
            </div>
            <div>
              <div className="highlight-value">{pendingAction}</div>
              <div className="highlight-label">Pending Action</div>
            </div>
          </div>
          <div className="highlight-item">
            <div className="highlight-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
              <i className="bi bi-geo-alt"></i>
            </div>
            <div>
              <div className="highlight-value">{districtCoverage}</div>
              <div className="highlight-label">Districts Covered</div>
            </div>
          </div>
          <div className="highlight-item">
            <div className="highlight-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
              <i className="bi bi-trophy"></i>
            </div>
            <div>
              <div className="highlight-value">{totalCompleted}</div>
              <div className="highlight-label">Total Completed</div>
            </div>
          </div>
          <div className="highlight-item">
            <div className="highlight-icon" style={{ background: '#fce7f3', color: '#db2777' }}>
              <i className="bi bi-building"></i>
            </div>
            <div>
              <div className="highlight-value">{deptsWithAnnouncements}/{totalDepartments}</div>
              <div className="highlight-label">Active Departments</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
