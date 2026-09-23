import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMyPreferences, useUpdateMyPreferences, getGetMyPreferencesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Layout from '@/components/Layout';
import { filterVisibleAnnouncements, POST_PUBLICATION_STATUSES, departmentList } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { useSortableTable } from '@/hooks/useSortableTable';
import SortableHeader from '@/components/SortableHeader';
import { useAggregate, bucketsToRecord, type AggregateParams } from '@/lib/aggregates';

import NotificationsPanel from '@/components/dashboard/NotificationsPanel';
import QuickActionsPanel, { hasQuickActions } from '@/components/dashboard/QuickActionsPanel';
import RecentActivityFeed from '@/components/dashboard/RecentActivityFeed';
import SystemOverview from '@/components/dashboard/SystemOverview';
// Department Performance (Top 5 / Bottom 5 ranking) is hidden for now — the
// component lives at '@/components/dashboard/DepartmentPerformance' and can be
// re-imported and rendered again if the ranking is reinstated.
import KeyHighlights from '@/components/dashboard/KeyHighlights';
import RecentCompletions from '@/components/dashboard/RecentCompletions';
import MyCreatedAnnouncements from '@/components/dashboard/MyCreatedAnnouncements';
import PendingReviewQueue from '@/components/dashboard/PendingReviewQueue';
import RecentlyReviewed from '@/components/dashboard/RecentlyReviewed';
import DeptAnnouncementsByStatus from '@/components/dashboard/DeptAnnouncementsByStatus';
import DepartmentTeam from '@/components/dashboard/DepartmentTeam';
import MyPendingActions from '@/components/dashboard/MyPendingActions';
import MySubComponents from '@/components/dashboard/MySubComponents';
import PendingCompletionReviews from '@/components/dashboard/PendingCompletionReviews';
import PendingCMOCompletionReviews from '@/components/dashboard/PendingCMOCompletionReviews';


const COLORS = ['#79D1AD', '#AFA9EE', '#FDC24A', '#F58E8E'];

type DrillLevel = 'department' | 'district' | 'block';

export default function Dashboard() {
  const [deptView, setDeptView] = useState<'table' | 'graph'>('table');
  const { user } = useAuth();
  const { announcements, notifications } = useAppState();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // CM-only preference: lets the Chief Minister switch the Notifications
  // section off entirely. Persisted server-side against the account so the
  // choice follows the CM to any device/browser. Defaults to on (shown) when
  // no preference has been saved yet. Only fetched for the Chief Minister.
  const isCm = user?.role === 'chief_minister' || user?.role === 'ocac_viewer';
  const prefsQuery = useGetMyPreferences({ query: { queryKey: getGetMyPreferencesQueryKey(), enabled: isCm } });
  const updatePrefsMutation = useUpdateMyPreferences();
  const [cmNotificationsEnabled, setCmNotificationsEnabled] = useState<boolean>(true);
  useEffect(() => {
    const stored = prefsQuery.data?.preferences?.notificationsVisible;
    if (stored !== undefined) setCmNotificationsEnabled(stored);
  }, [prefsQuery.data]);
  const toggleCmNotifications = () => {
    const next = !cmNotificationsEnabled;
    // Optimistic: reflect the choice immediately, then persist server-side.
    setCmNotificationsEnabled(next);
    updatePrefsMutation.mutate(
      { data: { notificationsVisible: next } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetMyPreferencesQueryKey() });
        },
        onError: () => {
          // Roll back the toggle if the save failed.
          setCmNotificationsEnabled(prev => !prev);
        },
      },
    );
  };

  const [drillLevel, setDrillLevel] = useState<DrillLevel>('department');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const isDeptRole = user && ['dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user'].includes(user.role);

  const visibleAnnouncements = useMemo(() => filterVisibleAnnouncements(announcements, user?.id), [announcements, user?.id]);

  // KPI summary comes from the uncapped server aggregate. draftMode 'own'
  // mirrors filterVisibleAnnouncements (a creator still sees their own
  // drafts); role scoping is applied server-side, so for a department user the
  // overall totals already cover only their department.
  const summaryAgg = useAggregate({ groupBy: 'none', draftMode: 'own' }, !!user);
  const summary = {
    total: summaryAgg.overall.total,
    completed: summaryAgg.overall.completed,
    inReview: summaryAgg.overall.inReview,
    inProgress: summaryAgg.overall.inProgress,
    notStarted: summaryAgg.overall.notStarted,
  };

  // Drill-down table (department -> district -> block) is also server
  // aggregated so every level reflects all matching rows, not a capped sample.
  const drillParams = useMemo<AggregateParams>(() => {
    if (drillLevel === 'district' && selectedDept) {
      return { groupBy: 'district', department: selectedDept, draftMode: 'own' };
    }
    if (drillLevel === 'block' && selectedDept && selectedDistrict) {
      return { groupBy: 'block', department: selectedDept, district: selectedDistrict, draftMode: 'own' };
    }
    return { groupBy: 'department', draftMode: 'own' };
  }, [drillLevel, selectedDept, selectedDistrict]);
  const drillAgg = useAggregate(drillParams, !!user);

  // On-hold items are folded into the "Not Started" KPI bucket (see
  // statusGroups), which hides them from the people who can actually resume
  // them. Surface a dedicated, clickable alert for Admin / CMO Reviewer so held
  // announcements are reachable without disturbing the KPI count↔list invariant.
  // A CMO Reviewer may only resume an item whose pre-hold status was
  // post-publication, so count only those for them (admin can resume any).
  const canSeeHoldQueue = user?.role === 'admin' || user?.role === 'cmo_reviewer';
  const onHoldCount = useMemo(() => {
    if (!canSeeHoldQueue) return 0;
    const held = visibleAnnouncements.filter(a => a.workflowStatus === 'on_hold');
    if (user?.role === 'admin') return held.length;
    return held.filter(a => !!a.statusBeforeHold && POST_PUBLICATION_STATUSES.includes(a.statusBeforeHold)).length;
  }, [canSeeHoldQueue, user?.role, visibleAnnouncements]);

  const chartData = [
    { name: 'Completed', value: summary.completed, color: '#79D1AD' },
    { name: 'In-Review', value: summary.inReview, color: '#AFA9EE' },
    { name: 'In Progress', value: summary.inProgress, color: '#FDC24A' },
    { name: 'Not Started', value: summary.notStarted, color: '#F58E8E' },
  ];

  const drillData = useMemo(() => {
    if (drillLevel === 'department') {
      const rec = bucketsToRecord(drillAgg.buckets);
      const names = isDeptRole && user?.department ? [user.department] : departmentList;
      return names.map((name, idx) => {
        const c = rec[name] ?? { total: 0, completed: 0, inReview: 0, inProgress: 0, notStarted: 0 };
        return { id: idx + 1, name, rawKey: name, announcement: c.total, completed: c.completed, inReview: c.inReview, inProgress: c.inProgress, notStarted: c.notStarted };
      });
    }
    // Keep the blank-key bucket (records with no district/block) so the drill-in
    // rows still sum to the parent department's total (count↔list invariant).
    // It is surfaced as a labelled "(Unassigned)" row, sorted last, and carries
    // an empty rawKey so navigation falls back to the parent scope (the district
    // filter cannot express "no district").
    const unassignedLabel = drillLevel === 'block' ? '(No Block)' : '(No District)';
    return [...drillAgg.buckets]
      .sort((a, b) => (a.key || '\uffff').localeCompare(b.key || '\uffff'))
      .map((b, idx) => ({ id: idx + 1, name: b.key === '' ? unassignedLabel : b.key, rawKey: b.key, announcement: b.total, completed: b.completed, inReview: b.inReview, inProgress: b.inProgress, notStarted: b.notStarted }));
  }, [drillLevel, drillAgg.buckets, isDeptRole, user?.department]);

  const { sortedData: sortedDrillData, sortConfig: deptSortConfig, requestSort: requestDeptSort } = useSortableTable(
    drillData,
    undefined,
    { announcement: 'number', completed: 'number', inReview: 'number', inProgress: 'number', notStarted: 'number' }
  );

  const barData = drillData.filter(d => d.announcement > 0).slice(0, 10).map(d => ({
    name: d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name,
    Completed: d.completed,
    'In-Review': d.inReview,
    'In Progress': d.inProgress,
    'Not Started': d.notStarted,
  }));

  const drillInto = (level: DrillLevel, dept: string, district?: string) => {
    setDrillLevel(level);
    setSelectedDept(dept);
    setSelectedDistrict(district || '');
  };

  const firstColumnLabel = drillLevel === 'department' ? 'Department' : drillLevel === 'district' ? 'District' : 'Block';
  const progressTitle = drillLevel === 'department'
    ? 'Department Progress'
    : drillLevel === 'district'
    ? 'District Progress'
    : 'Block Progress';

  const goToAnnouncements = (statusGroup?: string, department?: string) => {
    const p = new URLSearchParams();
    if (statusGroup) p.set('statusGroup', statusGroup);
    if (department) p.set('department', department);
    const qs = p.toString();
    navigate(qs ? `/announcements?${qs}` : '/announcements');
  };

  const deptLink = (dept: string, statusGroup?: string) => {
    const p = new URLSearchParams();
    p.set('department', dept);
    if (statusGroup) p.set('statusGroup', statusGroup);
    return `/announcements?${p.toString()}`;
  };

  const renderStatCards = () => (
    <div className="widget-area">
      <div className="row" style={{ display: 'flex', gap: 16, flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}>
          <div className="card primary clickable-card" onClick={() => goToAnnouncements()}>
            <div className="card-body">
              <div className="widget-content">
                <div className="col-icon">
                  <div className="widget-icon"><i className="bi bi-megaphone"></i></div>
                </div>
                <div className="col-details">
                  <div className="widget-title">Total Announcement</div>
                  <span className="widget-count">{summary.total}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card card-completed clickable-card" onClick={() => goToAnnouncements('completed')}>
            <div className="card-body">
              <div className="widget-content">
                <div className="col-icon">
                  <div className="widget-icon"><i className="bi bi-check-circle"></i></div>
                </div>
                <div className="col-details">
                  <div className="widget-title">Completed</div>
                  <span className="widget-count">{summary.completed}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card card-inreview clickable-card" onClick={() => goToAnnouncements('inReview')}>
            <div className="card-body">
              <div className="widget-content">
                <div className="col-icon">
                  <div className="widget-icon"><i className="bi bi-search"></i></div>
                </div>
                <div className="col-details">
                  <div className="widget-title">In-Review</div>
                  <span className="widget-count">{summary.inReview}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card card-inprogress clickable-card" onClick={() => goToAnnouncements('inProgress')}>
            <div className="card-body">
              <div className="widget-content">
                <div className="col-icon">
                  <div className="widget-icon"><i className="bi bi-arrow-repeat"></i></div>
                </div>
                <div className="col-details">
                  <div className="widget-title">In Progress</div>
                  <span className="widget-count">{summary.inProgress}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="card card-not-started clickable-card" onClick={() => goToAnnouncements('notStarted')}>
            <div className="card-body">
              <div className="widget-content">
                <div className="col-icon">
                  <div className="widget-icon"><i className="bi bi-x-circle"></i></div>
                </div>
                <div className="col-details">
                  <div className="widget-title">Not Started</div>
                  <span className="widget-count">{summary.notStarted}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCharts = () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 33%', minWidth: 350 }}>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 0 }}>
            <nav className="top-bar">
              <h4 className="title">{isDeptRole ? 'Department' : 'HCM'} Announcement Status</h4>
            </nav>
            <div className="chart-container" style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={80}
                    outerRadius={150}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={3}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                      if (value === 0) return null;
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fill: '#fff', fontSize: 13, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {value}
                        </text>
                      );
                    }}
                    labelLine={false}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: d.color, display: 'inline-block' }}></span>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a3a5c' }}>{d.name}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#555' }}>Count: <strong>{d.value}</strong></div>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="bottom" align="center"
                    formatter={(value) => { const item = chartData.find(d => d.name === value); return `${value}: ${item?.value ?? 0}`; }}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <text x="50%" y="42%" textAnchor="middle" style={{ fill: 'grey', fontSize: 16 }}>Total</text>
                  <text x="50%" y="50%" textAnchor="middle" style={{ fill: '#333', fontSize: 28, fontWeight: 'bold' }}>{summary.total}</text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 60%', minWidth: 400 }}>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 0 }}>
            <nav className="top-bar" style={{ justifyContent: 'space-between' }}>
              <h4 className="title">{progressTitle}</h4>
              <div className="two-view">
                <div className="nav-tabs" style={{ display: 'flex', border: '1px solid #dee2e6', borderRadius: 6, overflow: 'hidden' }}>
                  <button className={`nav-link ${deptView === 'table' ? 'active' : ''}`} onClick={() => setDeptView('table')}
                    style={{ border: 'none', padding: '6px 12px', cursor: 'pointer', background: deptView === 'table' ? '#1a3a5c' : '#fff', color: deptView === 'table' ? '#fff' : '#666' }}>
                    <i className="bi bi-table"></i>
                  </button>
                  <button className={`nav-link ${deptView === 'graph' ? 'active' : ''}`} onClick={() => setDeptView('graph')}
                    style={{ border: 'none', padding: '6px 12px', cursor: 'pointer', background: deptView === 'graph' ? '#1a3a5c' : '#fff', color: deptView === 'graph' ? '#fff' : '#666' }}>
                    <i className="bi bi-bar-chart"></i>
                  </button>
                </div>
              </div>
            </nav>

            {drillLevel !== 'department' && (
              <div className="drill-breadcrumb">
                <span className="drill-crumb clickable" onClick={() => drillInto('department', '')}>
                  <i className="bi bi-building"></i> All Departments
                </span>
                <i className="bi bi-chevron-right drill-sep"></i>
                {drillLevel === 'district' && (
                  <span className="drill-crumb active">{selectedDept}</span>
                )}
                {drillLevel === 'block' && (
                  <>
                    <span className="drill-crumb clickable" onClick={() => drillInto('district', selectedDept)}>
                      {selectedDept}
                    </span>
                    <i className="bi bi-chevron-right drill-sep"></i>
                    <span className="drill-crumb active">{selectedDistrict}</span>
                  </>
                )}
              </div>
            )}

            {deptView === 'table' ? (
              <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', marginTop: drillLevel !== 'department' ? 0 : 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Sl No.</th>
                      <SortableHeader label={firstColumnLabel} sortKey="name" sortConfig={deptSortConfig} onSort={requestDeptSort} style={{ width: 265 }} />
                      <SortableHeader label="Announcement" sortKey="announcement" sortConfig={deptSortConfig} onSort={requestDeptSort} className="text-center" style={{ width: 160 }} />
                      <SortableHeader label="Completed" sortKey="completed" sortConfig={deptSortConfig} onSort={requestDeptSort} className="light-green text-center" style={{ width: 105 }} />
                      <SortableHeader label="In-Review" sortKey="inReview" sortConfig={deptSortConfig} onSort={requestDeptSort} className="light-purple text-center" style={{ width: 95 }} />
                      <SortableHeader label="In Progress" sortKey="inProgress" sortConfig={deptSortConfig} onSort={requestDeptSort} className="light-yellow text-center" style={{ width: 105 }} />
                      <SortableHeader label="Not Started" sortKey="notStarted" sortConfig={deptSortConfig} onSort={requestDeptSort} className="light-red text-center" style={{ width: 108 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDrillData.map((row, idx) => {
                      const handleRowClick = () => {
                        if (drillLevel === 'department') {
                          drillInto('district', row.rawKey);
                        } else if (drillLevel === 'district' && row.rawKey) {
                          drillInto('block', selectedDept, row.rawKey);
                        } else if (drillLevel === 'district') {
                          // Unassigned-district row: cannot drill into blocks, so
                          // jump straight to the department-scoped list.
                          const p = new URLSearchParams();
                          p.set('department', selectedDept);
                          navigate(`/announcements?${p.toString()}`);
                        } else {
                          const p = new URLSearchParams();
                          p.set('department', selectedDept);
                          if (selectedDistrict) p.set('district', selectedDistrict);
                          navigate(`/announcements?${p.toString()}`);
                        }
                      };

                      const handleStatusClick = (e: React.MouseEvent, statusGroup: string) => {
                        e.stopPropagation();
                        const p = new URLSearchParams();
                        p.set('statusGroup', statusGroup);
                        if (drillLevel === 'department') {
                          p.set('department', row.rawKey);
                        } else if (drillLevel === 'district') {
                          p.set('department', selectedDept);
                          if (row.rawKey) p.set('district', row.rawKey);
                        } else {
                          p.set('department', selectedDept);
                          if (selectedDistrict) p.set('district', selectedDistrict);
                        }
                        navigate(`/announcements?${p.toString()}`);
                      };

                      return (
                        <tr key={row.id} className="clickable-row" onClick={handleRowClick} style={{ cursor: 'pointer' }}>
                          <td>{idx + 1}</td>
                          <td><span className="dash-link">{row.name}</span></td>
                          <td className="text-center"><span className="dash-link">{row.announcement}</span></td>
                          <td className="light-green-100 text-center"><span className="dash-link" onClick={(e) => handleStatusClick(e, 'completed')}>{row.completed}</span></td>
                          <td className="light-purple-100 text-center"><span className="dash-link" onClick={(e) => handleStatusClick(e, 'inReview')}>{row.inReview}</span></td>
                          <td className="light-yellow-100 text-center"><span className="dash-link" onClick={(e) => handleStatusClick(e, 'inProgress')}>{row.inProgress}</span></td>
                          <td className="light-red-100 text-center"><span className="dash-link" onClick={(e) => handleStatusClick(e, 'notStarted')}>{row.notStarted}</span></td>
                        </tr>
                      );
                    })}
                    {sortedDrillData.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>No data available at this level.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: 420, marginTop: drillLevel !== 'department' ? 0 : 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Completed" stackId="a" fill="#79D1AD" />
                    <Bar dataKey="In-Review" stackId="a" fill="#AFA9EE" />
                    <Bar dataKey="In Progress" stackId="a" fill="#FDC24A" />
                    <Bar dataKey="Not Started" stackId="a" fill="#F58E8E" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRolePortlets = () => {
    if (!user) return null;

    switch (user.role) {
      case 'admin':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <SystemOverview />
            </div>
            <div className="portlets-grid portlets-grid-full">
              <RecentActivityFeed />
            </div>
          </div>
        );

      case 'chief_minister':
      case 'ocac_viewer': {
        const hasNotifications = notifications.some(n => n.userId === user.id);
        const showNotifications = hasNotifications && cmNotificationsEnabled;
        return (
          <div className="portlets-section">
            {hasNotifications && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={toggleCmNotifications}
                  title={cmNotificationsEnabled ? 'Hide the Notifications section' : 'Show the Notifications section'}
                  aria-pressed={cmNotificationsEnabled}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#fff', color: '#1a3a5c',
                    border: '1px solid #b3d7f2', padding: '7px 14px',
                    borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  <i className={cmNotificationsEnabled ? 'bi bi-bell' : 'bi bi-bell-slash'}></i>
                  {cmNotificationsEnabled ? 'Notifications: On' : 'Notifications: Off'}
                </button>
              </div>
            )}
            <div className={`portlets-grid${showNotifications ? '' : ' portlets-grid-full'}`}>
              {showNotifications && <NotificationsPanel />}
              <KeyHighlights />
            </div>
            <div className="portlets-grid portlets-grid-full">
              <RecentCompletions />
            </div>
          </div>
        );
      }

      case 'cmo_nodal':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <MyCreatedAnnouncements />
            </div>
          </div>
        );

      case 'cmo_reviewer':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <PendingReviewQueue />
            </div>
            <div className="portlets-grid">
              <PendingCMOCompletionReviews />
              <RecentlyReviewed scope="cmo" />
            </div>
          </div>
        );

      case 'dept_head':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <DeptAnnouncementsByStatus />
            </div>
            <div className="portlets-grid portlets-grid-full">
              <DepartmentTeam />
            </div>
          </div>
        );

      case 'dept_nodal':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <MyPendingActions />
            </div>
            <div className="portlets-grid portlets-grid-full">
              <MySubComponents />
            </div>
          </div>
        );

      case 'dept_user':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <MySubComponents />
            </div>
          </div>
        );

      case 'dept_reviewer':
        return (
          <div className="portlets-section">
            <div className="portlets-grid">
              <NotificationsPanel />
              <PendingCompletionReviews />
            </div>
            <div className="portlets-grid portlets-grid-full">
              <RecentlyReviewed scope="dept" />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          {user && hasQuickActions(user.role) && (
            <div style={{ marginBottom: 16 }}>
              <QuickActionsPanel role={user.role} />
            </div>
          )}
          {isDeptRole && user?.department && (
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#e8f4fd', borderRadius: 8, border: '1px solid #b3d7f2' }}>
              <i className="bi bi-building" style={{ marginRight: 8 }}></i>
              <strong>Department:</strong> {user.department}
            </div>
          )}

          <div className="dashboard-section">
            {canSeeHoldQueue && onHoldCount > 0 && (
              <div
                className="clickable-card"
                onClick={() => navigate(user?.role === 'admin' ? '/announcements?status=on_hold' : '/my-actions')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', marginBottom: 16,
                  background: '#fef3e2', border: '1px solid #f5c97a',
                  borderLeft: '4px solid #d97706', borderRadius: 8, cursor: 'pointer',
                }}
              >
                <i className="bi bi-pause-circle" style={{ fontSize: 22, color: '#d97706' }}></i>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#92400e' }}>
                    {onHoldCount} announcement{onHoldCount !== 1 ? 's' : ''} on hold
                  </div>
                  <div style={{ fontSize: 13, color: '#a16207' }}>
                    These are paused and waiting to be resumed. Click to review and resume them.
                  </div>
                </div>
                <i className="bi bi-chevron-right" style={{ color: '#d97706' }}></i>
              </div>
            )}
            {renderStatCards()}
            {renderCharts()}
            {renderRolePortlets()}
          </div>
        </div>
      </div>
    </Layout>
  );
}
