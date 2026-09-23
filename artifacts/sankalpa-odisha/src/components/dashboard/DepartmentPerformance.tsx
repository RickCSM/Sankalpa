import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAppState } from '@/context/AppStateContext';
import { departmentList } from '@/data/mockData';

export default function DepartmentPerformance() {
  const [, navigate] = useLocation();
  const { deptStats } = useAppState();

  const deptData = useMemo(() =>
    departmentList.map((name, idx) => ({
      id: idx + 1,
      name,
      announcement: deptStats[name]?.total ?? 0,
      completed:    deptStats[name]?.completed ?? 0,
      inReview:     deptStats[name]?.inReview ?? 0,
      inProgress:   deptStats[name]?.inProgress ?? 0,
      notStarted:   deptStats[name]?.notStarted ?? 0,
    })),
    [deptStats],
  );

  const deptsWithRate = deptData
    .filter(d => d.announcement > 0)
    .map(d => ({
      ...d,
      completionRate: Math.round((d.completed / d.announcement) * 100),
    }))
    .sort((a, b) => b.completionRate - a.completionRate);

  const top5 = deptsWithRate.slice(0, 5);
  const bottom5 = deptsWithRate.slice(-5).reverse();

  const renderList = (depts: typeof top5, label: string, color: string) => (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color }}>{label}</div>
      {depts.map((d, idx) => (
        <div
          key={d.id}
          className="portlet-list-item"
          onClick={() => navigate(`/announcements?department=${encodeURIComponent(d.name)}`)}
          style={{ cursor: 'pointer' }}
        >
          <span className="portlet-rank" style={{ background: color, color: '#fff' }}>{label.includes('Top') ? idx + 1 : deptsWithRate.length - 4 + idx}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="portlet-list-text">{d.name}</div>
          </div>
          <div className="portlet-progress-bar-wrapper">
            <div className="portlet-progress-bar" style={{ width: `${d.completionRate}%`, background: color }}></div>
          </div>
          <span className="portlet-badge" style={{ background: `${color}20`, color }}>{d.completionRate}%</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="card portlet-card">
      <div className="card-body" style={{ paddingTop: 0 }}>
        <nav className="top-bar">
          <h4 className="title"><i className="bi bi-graph-up" style={{ marginRight: 8 }}></i>Department Performance</h4>
        </nav>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
          {renderList(top5, 'Top 5', '#22c55e')}
          {renderList(bottom5, 'Bottom 5', '#ef4444')}
        </div>
      </div>
    </div>
  );
}
