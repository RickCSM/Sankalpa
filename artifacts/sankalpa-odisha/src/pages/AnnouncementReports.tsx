import { useState, useMemo } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';
import Layout from '@/components/Layout';
import { useScopedAnnouncements } from '@/hooks/useScopedAnnouncements';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { departmentList, odishaDistricts, odishaDistrictBlocks, workflowStatusLabels, workflowStatusColors, excludeDrafts, scopeForUser, formatDate } from '@/data/mockData';
import { useAggregate, useAgingAggregate, bucketsToRecord, type AggregateBucket } from '@/lib/aggregates';
import { useListOccasions, getListOccasionsQueryKey } from '@workspace/api-client-react';
import { useSortableTable } from '@/hooks/useSortableTable';
import SortableHeader from '@/components/SortableHeader';
import ReportHeader from '@/components/ReportHeader';
import { downloadExcel, downloadPdf, ExcelBuilder, PdfBuilder, type ReportColumn } from '@/lib/reportDownloads';
import type { WorkflowStatus, Announcement } from '@/data/mockData';

const AGING_BUCKETS = [
  { label: '0-7 days', min: 0, max: 7, color: '#16a34a', bg: '#dcfce7' },
  { label: '8-30 days', min: 8, max: 30, color: '#f59e0b', bg: '#fef3c7' },
  { label: '31-60 days', min: 31, max: 60, color: '#ea580c', bg: '#ffedd5' },
  { label: '60+ days', min: 61, max: Infinity, color: '#dc2626', bg: '#fee2e2' },
];

function getDaysSince(dateStr: string): number {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
}

function getBucketIndex(days: number): number {
  for (let i = 0; i < AGING_BUCKETS.length; i++) {
    if (days >= AGING_BUCKETS[i].min && days <= AGING_BUCKETS[i].max) return i;
  }
  return AGING_BUCKETS.length - 1;
}

interface AgingRow {
  id: number;
  title: string;
  department: string;
  workflowStatus: WorkflowStatus;
  date: string;
  days: number;
  bucket: string;
  bucketIndex: number;
}

const PAGE_SIZE = 25;

function formatReportDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(match[2]) - 1];
  return month ? `${match[3]} ${month} ${match[1]}` : value;
}

// Merge server-aggregated buckets with a master list of names so count tables
// still show every district / department / block (incl. zero-count rows), as
// the old client compute* helpers did. Output matches the StatusRow shape.
function mergeBuckets(masterNames: string[], buckets: AggregateBucket[], emptyLabel?: string) {
  const rec = bucketsToRecord(buckets);
  // Drop the empty-string key for dimensions where a blank is "no value"
  // (district/block), matching the old compute* helpers. For dimensions where a
  // blank is a real group to count (occasion), pass emptyLabel to keep it.
  const names = Array.from(new Set([...masterNames, ...buckets.map(b => b.key)]))
    .filter(n => n !== '' || emptyLabel !== undefined);
  // Sort the blank-key ("unassigned") row last, like the dashboard drill table.
  names.sort((a, b) => (a || '\uffff').localeCompare(b || '\uffff'));
  return names.map((name, idx) => {
    const c = rec[name] ?? { total: 0, completed: 0, inReview: 0, inProgress: 0, notStarted: 0 };
    return {
      id: idx + 1,
      name: name === '' ? emptyLabel! : name,
      announcement: c.total,
      completed: c.completed,
      inProgress: c.inProgress,
      inReview: c.inReview,
      notStarted: c.notStarted,
    };
  });
}

const statusColumns = [
  { key: 'announcement', label: 'Total' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'inReview', label: 'In Review' },
  { key: 'notStarted', label: 'Not Started' },
];

function StatusBreakdownHeaders({ sortConfig, requestSort }: { sortConfig: ReturnType<typeof useSortableTable>['sortConfig']; requestSort: (key: string) => void }) {
  return (
    <>
      {statusColumns.map(col => (
        <SortableHeader key={col.key} label={col.label} sortKey={col.key} sortConfig={sortConfig} onSort={requestSort} className="text-center" />
      ))}
    </>
  );
}

type StatusRow = { announcement: number; completed: number; inProgress: number; inReview: number; notStarted: number };

function StatusBreakdownCells({ row }: { row: StatusRow }) {
  return (
    <>
      <td className="text-center" style={{ fontWeight: 700 }}>{row.announcement}</td>
      <td className="text-center" style={{ color: '#16a34a' }}>{row.completed}</td>
      <td className="text-center" style={{ color: '#2563eb' }}>{row.inProgress}</td>
      <td className="text-center" style={{ color: '#f59e0b' }}>{row.inReview}</td>
      <td className="text-center" style={{ color: '#6b7280' }}>{row.notStarted}</td>
    </>
  );
}

function PaginationControls({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (fn: (p: number) => number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }}>Prev</button>
      <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }}>Next</button>
    </div>
  );
}

const STATUS_BREAKDOWN_COLUMNS: ReportColumn<StatusRow & { name: string; sl?: number }>[] = [
  { key: 'name', label: 'Name' },
  { key: 'announcement', label: 'Total', align: 'center' },
  { key: 'completed', label: 'Completed', align: 'center' },
  { key: 'inProgress', label: 'In Progress', align: 'center' },
  { key: 'inReview', label: 'In Review', align: 'center' },
  { key: 'notStarted', label: 'Not Started', align: 'center' },
];

function statusBreakdownTotals<T extends StatusRow>(rows: T[]): Record<string, number | string> {
  const t = rows.reduce((acc, r) => ({
    announcement: acc.announcement + r.announcement,
    completed: acc.completed + r.completed,
    inProgress: acc.inProgress + r.inProgress,
    inReview: acc.inReview + r.inReview,
    notStarted: acc.notStarted + r.notStarted,
  }), { announcement: 0, completed: 0, inProgress: 0, inReview: 0, notStarted: 0 });
  return { name: 'Total', ...t };
}

// URL token for the "(No Block)" bucket in the location detail route.
const NO_BLOCK_PARAM = '__no-block__';

export function LocationWiseReport() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  // URL-driven drill-in: /reports/location-wise?district=Khordha shows the
  // blocks view. Keeping the level in the URL means breadcrumbs, deep links,
  // and history navigation all restore the correct level (districts vs blocks).
  const selectedDistrict = useMemo(() => new URLSearchParams(search).get('district'), [search]);
  const [page, setPage] = useState(1);
  const openDistrict = (district: string | null) => {
    setPage(1);
    navigate(district ? `/reports/location-wise?district=${encodeURIComponent(district)}` : '/reports/location-wise');
  };

  const districtAgg = useAggregate({ groupBy: 'district', draftMode: 'exclude' }, !!user);
  const blockAgg = useAggregate(
    { groupBy: 'block', district: selectedDistrict ?? undefined, draftMode: 'exclude' },
    !!user && !!selectedDistrict,
  );
  const districtData = useMemo(() => mergeBuckets(odishaDistricts, districtAgg.buckets), [districtAgg.buckets]);
  const blockData = useMemo(
    // Keep the blank-block bucket visible as "(No Block)" so the drill-in rows
    // always sum to the district row's total (count<->list invariant).
    () => selectedDistrict ? mergeBuckets(odishaDistrictBlocks[selectedDistrict] ?? [], blockAgg.buckets, '(No Block)') : [],
    [selectedDistrict, blockAgg.buckets]
  );

  const activeData = selectedDistrict ? blockData : districtData;
  const { sortedData, sortConfig, requestSort } = useSortableTable(activeData);
  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cols = useMemo(() => {
    const labelCol: ReportColumn<typeof sortedData[number]> = { key: 'name', label: selectedDistrict ? 'Block' : 'District' };
    return [labelCol, ...STATUS_BREAKDOWN_COLUMNS.slice(1) as ReportColumn<typeof sortedData[number]>[]];
  }, [selectedDistrict]);
  const reportName = selectedDistrict ? `Location-wise Report — ${selectedDistrict} Blocks` : 'Location-wise Report';
  const filterSummary = [
    ...(selectedDistrict ? [`District: ${selectedDistrict}`] : ['Scope: All Districts']),
    `Records: ${sortedData.length}`,
  ];

  const handleExcel = () => downloadExcel({
    reportName,
    filterSummary,
    sheets: [{ name: selectedDistrict ? 'Blocks' : 'Districts', columns: cols, rows: sortedData, totalsRow: statusBreakdownTotals(sortedData) }],
  });
  const handlePdf = () => downloadPdf({
    reportName,
    filterSummary,
    sections: [{ heading: selectedDistrict ? `Blocks in ${selectedDistrict}` : 'Districts of Odisha', columns: cols, rows: sortedData, totalsRow: statusBreakdownTotals(sortedData) }],
  });

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader title={reportName} onExcel={handleExcel} onPdf={handlePdf} disabled={sortedData.length === 0} />

          <div style={{ marginBottom: 16, fontSize: 14 }}>
            <span
              style={{ cursor: selectedDistrict ? 'pointer' : 'default', color: selectedDistrict ? '#2563eb' : '#1a3a5c', fontWeight: 600 }}
              onClick={() => openDistrict(null)}
            >
              All Districts
            </span>
            {selectedDistrict && (
              <>
                <span style={{ margin: '0 8px', color: '#999' }}>/</span>
                <span style={{ fontWeight: 600, color: '#1a3a5c' }}>{selectedDistrict}</span>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label={selectedDistrict ? 'Block' : 'District'} sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
                      <StatusBreakdownHeaders sortConfig={sortConfig} requestSort={requestSort} />
                      <th className="text-center">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No data available</td></tr>
                    ) : (
                      paged.map((row, idx) => {
                        const detailPath = selectedDistrict
                          ? `/reports/location-wise/${encodeURIComponent(selectedDistrict)}/${encodeURIComponent(row.name === '(No Block)' ? NO_BLOCK_PARAM : row.name)}`
                          : `/reports/location-wise/${encodeURIComponent(row.name)}`;
                        return (
                          <tr key={row.id}>
                            <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                            <td>
                              {!selectedDistrict ? (
                                <a
                                  style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}
                                  onClick={() => openDistrict(row.name)}
                                >
                                  {row.name}
                                </a>
                              ) : (
                                <a
                                  style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}
                                  onClick={() => navigate(detailPath)}
                                >
                                  {row.name}
                                </a>
                              )}
                            </td>
                            <StatusBreakdownCells row={row} />
                            <td className="text-center">
                              <a
                                style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'none', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
                                onClick={() => navigate(detailPath)}
                              >
                                View announcements
                              </a>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function DepartmentWiseReport() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const deptAgg = useAggregate({ groupBy: 'department', draftMode: 'exclude' }, !!user);
  const deptData = useMemo(() => mergeBuckets(departmentList, deptAgg.buckets), [deptAgg.buckets]);
  const { sortedData, sortConfig, requestSort } = useSortableTable(deptData);
  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => statusBreakdownTotals(sortedData), [sortedData]);

  const cols = useMemo<ReportColumn<typeof sortedData[number]>[]>(() => {
    const first: ReportColumn<typeof sortedData[number]> = { key: 'name', label: 'Department' };
    return [first, ...STATUS_BREAKDOWN_COLUMNS.slice(1) as ReportColumn<typeof sortedData[number]>[]];
  }, []);

  const reportName = 'Department-wise Report';
  const filterSummary = ['Scope: All Departments', `Records: ${sortedData.length}`];
  const handleExcel = () => downloadExcel({
    reportName,
    filterSummary,
    sheets: [{ name: 'Departments', columns: cols, rows: sortedData, totalsRow: totals }],
  });
  const handlePdf = () => downloadPdf({
    reportName,
    filterSummary,
    sections: [{ heading: 'Departments', columns: cols, rows: sortedData, totalsRow: totals }],
  });

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader title={reportName} onExcel={handleExcel} onPdf={handlePdf} disabled={sortedData.length === 0} />

          <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            Click any department name to see its announcements grouped by status.
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Department" sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
                      <StatusBreakdownHeaders sortConfig={sortConfig} requestSort={requestSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row, idx) => (
                      <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/reports/department-wise/${encodeURIComponent(row.name)}`)}>
                        <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <a style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                            {row.name}
                          </a>
                        </td>
                        <StatusBreakdownCells row={row} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                      <td></td>
                      <td>Total</td>
                      <td className="text-center">{totals.announcement}</td>
                      <td className="text-center" style={{ color: '#16a34a' }}>{totals.completed}</td>
                      <td className="text-center" style={{ color: '#2563eb' }}>{totals.inProgress}</td>
                      <td className="text-center" style={{ color: '#f59e0b' }}>{totals.inReview}</td>
                      <td className="text-center" style={{ color: '#6b7280' }}>{totals.notStarted}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

const STATUS_GROUPS: { key: string; label: string; statuses: WorkflowStatus[] }[] = [
  { key: 'all', label: 'All', statuses: ['pending_cmo_review', 'reverted_by_cmo', 'published', 'accepted', 'in_progress', 'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review', 'completed'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'in_progress', label: 'In Progress', statuses: ['accepted', 'in_progress'] },
  { key: 'in_review', label: 'In-Review', statuses: ['pending_cmo_review', 'pending_completion_review', 'pending_cmo_completion_review'] },
  { key: 'not_started', label: 'Not Started', statuses: ['published', 'reverted_by_cmo', 'reverted_by_dept_reviewer'] },
];

function StatusGroupTabs({ activeTab, tabCounts, onSelect }: { activeTab: string; tabCounts: Record<string, number>; onSelect: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 16, flexWrap: 'wrap' }}>
      {STATUS_GROUPS.map(g => {
        const isActive = g.key === activeTab;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onSelect(g.key)}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '3px solid #1a3a5c' : '3px solid transparent',
              color: isActive ? '#1a3a5c' : '#64748b',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: -1,
            }}
          >
            {g.label}
            <span style={{
              background: isActive ? '#1a3a5c' : '#e2e8f0',
              color: isActive ? '#fff' : '#64748b',
              borderRadius: 12,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 700,
              minWidth: 22,
              textAlign: 'center',
            }}>{tabCounts[g.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DepartmentDetailReport() {
  const [, params] = useRoute<{ dept: string }>('/reports/department-wise/:dept');
  const [, navigate] = useLocation();
  const { announcements } = useScopedAnnouncements();
  const { users } = useAppState();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [page, setPage] = useState(1);

  const dept = params?.dept ? decodeURIComponent(params.dept) : '';

  const isDeptRole = user && ['dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user'].includes(user.role);
  const accessDenied = !!isDeptRole && (!user?.department || (!!dept && user!.department !== dept));

  const allDeptAnns = useMemo(() => scopeForUser(excludeDrafts(announcements), user).filter(a => a.department === dept), [announcements, dept, user]);

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of STATUS_GROUPS) {
      m[g.key] = allDeptAnns.filter(a => g.statuses.includes(a.workflowStatus)).length;
    }
    return m;
  }, [allDeptAnns]);

  const activeGroup = STATUS_GROUPS.find(g => g.key === activeTab) ?? STATUS_GROUPS[0];
  const filtered = useMemo(() => allDeptAnns.filter(a => activeGroup.statuses.includes(a.workflowStatus)), [allDeptAnns, activeGroup]);

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);

  type Row = Announcement & { createdByName: string };
  const rows: Row[] = useMemo(() => filtered.map(a => ({ ...a, createdByName: userMap.get(a.createdBy) ?? `User #${a.createdBy}` })), [filtered, userMap]);

  const { sortedData, sortConfig, requestSort } = useSortableTable(rows, { key: 'date', direction: 'desc' }, { date: 'date' });
  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportColumns: ReportColumn<Row>[] = [
    { key: 'title', label: 'Title' },
    { key: 'date', label: 'Date', format: r => formatReportDate(r.date) },
    { key: 'district', label: 'District', format: r => r.district ?? '-' },
    { key: 'workflowStatus', label: 'Status', format: r => workflowStatusLabels[r.workflowStatus] },
    { key: 'createdByName', label: 'Created By' },
  ];
  const reportName = `Department-wise Report — ${dept} (${activeGroup.label})`;
  const filterSummary = [`Department: ${dept}`, `Status group: ${activeGroup.label}`, `Records: ${sortedData.length}`];
  const handleExcel = () => downloadExcel({
    reportName,
    filterSummary,
    sheets: [{ name: activeGroup.label.slice(0, 31), columns: exportColumns, rows: sortedData }],
  });
  const handlePdf = () => downloadPdf({
    reportName,
    filterSummary,
    sections: [{ heading: `${dept} — ${activeGroup.label} (${sortedData.length})`, columns: exportColumns, rows: sortedData }],
  });

  if (!dept) {
    return (
      <Layout>
        <div className="page-container">
          <div className="inner-page-layout">
            <div className="page-header"><h4>Department not found</h4></div>
            <a onClick={() => navigate('/reports/department-wise')} style={{ color: '#2563eb', cursor: 'pointer' }}>← Back to Department-wise Report</a>
          </div>
        </div>
      </Layout>
    );
  }

  if (accessDenied) {
    return (
      <Layout>
        <div className="page-container">
          <div className="inner-page-layout">
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <i className="bi bi-shield-lock" style={{ fontSize: 40, color: '#ef4444', display: 'block', marginBottom: 12 }}></i>
                <h4 style={{ marginBottom: 8 }}>Access Denied</h4>
                <p style={{ color: '#666', marginBottom: 16 }}>You do not have access to this department's report.</p>
                <button className="btn-submit" onClick={() => navigate('/')}>Back to Dashboard</button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader
            title={reportName}
            above={
              <a
                onClick={() => navigate('/reports/department-wise')}
                style={{ color: '#2563eb', cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}
              >
                <i className="bi bi-chevron-left"></i> Back to Department-wise Report
              </a>
            }
            onExcel={handleExcel}
            onPdf={handlePdf}
            disabled={sortedData.length === 0}
          />

          <div className="card">
            <div className="card-body">
              <StatusGroupTabs activeTab={activeTab} tabCounts={tabCounts} onSelect={key => { setActiveTab(key); setPage(1); }} />

              <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                Showing {paged.length} of {sortedData.length} announcements
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Title" sortKey="title" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Date" sortKey="date" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="District" sortKey="district" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Created By" sortKey="createdByName" sortConfig={sortConfig} onSort={requestSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No announcements in this status group</td></tr>
                    ) : (
                      paged.map((a, idx) => (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${a.id}`)}>
                          <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                          <td style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</td>
                          <td>{formatDate(a.date)}</td>
                          <td>{a.district || '-'}</td>
                          <td>
                            <span className={`status-badge ${workflowStatusColors[a.workflowStatus]}`}>
                              {workflowStatusLabels[a.workflowStatus]}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{a.createdByName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function LocationDetailReport() {
  const [matchesBlock, blockParams] = useRoute<{ district: string; block: string }>('/reports/location-wise/:district/:block');
  const [, distParams] = useRoute<{ district: string }>('/reports/location-wise/:district');
  const [, navigate] = useLocation();
  const { announcements } = useScopedAnnouncements();
  const { users } = useAppState();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [page, setPage] = useState(1);

  const district = decodeURIComponent((matchesBlock ? blockParams?.district : distParams?.district) ?? '');
  const rawBlock = matchesBlock && blockParams?.block ? decodeURIComponent(blockParams.block) : null;
  const isNoBlock = rawBlock === NO_BLOCK_PARAM;
  const blockLabel = rawBlock === null ? null : (isNoBlock ? '(No Block)' : rawBlock);

  const allLocAnns = useMemo(() =>
    scopeForUser(excludeDrafts(announcements), user).filter(a => {
      if ((a.district ?? '') !== district) return false;
      if (rawBlock === null) return true;
      if (isNoBlock) return !a.block;
      return a.block === rawBlock;
    }),
    [announcements, user, district, rawBlock, isNoBlock],
  );

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of STATUS_GROUPS) {
      m[g.key] = allLocAnns.filter(a => g.statuses.includes(a.workflowStatus)).length;
    }
    return m;
  }, [allLocAnns]);

  const activeGroup = STATUS_GROUPS.find(g => g.key === activeTab) ?? STATUS_GROUPS[0];
  const filtered = useMemo(() => allLocAnns.filter(a => activeGroup.statuses.includes(a.workflowStatus)), [allLocAnns, activeGroup]);

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u.name])), [users]);

  type Row = Announcement & { createdByName: string };
  const rows: Row[] = useMemo(() => filtered.map(a => ({ ...a, createdByName: userMap.get(a.createdBy) ?? `User #${a.createdBy}` })), [filtered, userMap]);

  const { sortedData, sortConfig, requestSort } = useSortableTable(rows, { key: 'date', direction: 'desc' }, { date: 'date' });
  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportColumns: ReportColumn<Row>[] = [
    { key: 'title', label: 'Title' },
    { key: 'date', label: 'Date', format: r => formatReportDate(r.date) },
    { key: 'department', label: 'Department', format: r => r.department || '-' },
    { key: 'block', label: 'Block', format: r => r.block ?? '-' },
    { key: 'workflowStatus', label: 'Status', format: r => workflowStatusLabels[r.workflowStatus] },
    { key: 'createdByName', label: 'Created By' },
  ];
  const locationLabel = blockLabel ? `${district} / ${blockLabel}` : district;
  const reportName = `Location-wise Report — ${locationLabel} (${activeGroup.label})`;
  const filterSummary = [
    `District: ${district}`,
    ...(blockLabel ? [`Block: ${blockLabel}`] : []),
    `Status group: ${activeGroup.label}`,
    `Records: ${sortedData.length}`,
  ];
  const handleExcel = () => downloadExcel({
    reportName,
    filterSummary,
    sheets: [{ name: activeGroup.label.slice(0, 31), columns: exportColumns, rows: sortedData }],
  });
  const handlePdf = () => downloadPdf({
    reportName,
    filterSummary,
    sections: [{ heading: `${locationLabel} — ${activeGroup.label} (${sortedData.length})`, columns: exportColumns, rows: sortedData }],
  });

  if (!district) {
    return (
      <Layout>
        <div className="page-container">
          <div className="inner-page-layout">
            <div className="page-header"><h4>District not found</h4></div>
            <a onClick={() => navigate('/reports/location-wise')} style={{ color: '#2563eb', cursor: 'pointer' }}>← Back to Location-wise Report</a>
          </div>
        </div>
      </Layout>
    );
  }

  const linkStyle = { color: '#2563eb', cursor: 'pointer', textDecoration: 'none' as const, fontWeight: 600 };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader
            title={reportName}
            above={
              <a
                onClick={() => navigate('/reports/location-wise')}
                style={{ color: '#2563eb', cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}
              >
                <i className="bi bi-chevron-left"></i> Back to Location-wise Report
              </a>
            }
            onExcel={handleExcel}
            onPdf={handlePdf}
            disabled={sortedData.length === 0}
          />

          <div style={{ marginBottom: 16, fontSize: 14 }}>
            <span style={linkStyle} onClick={() => navigate('/reports/location-wise')}>All Districts</span>
            <span style={{ margin: '0 8px', color: '#999' }}>/</span>
            {blockLabel ? (
              <>
                <span style={linkStyle} onClick={() => navigate(`/reports/location-wise?district=${encodeURIComponent(district)}`)}>{district}</span>
                <span style={{ margin: '0 8px', color: '#999' }}>/</span>
                <span style={{ fontWeight: 600, color: '#1a3a5c' }}>{blockLabel}</span>
              </>
            ) : (
              <span style={{ fontWeight: 600, color: '#1a3a5c' }}>{district}</span>
            )}
          </div>

          <div className="card">
            <div className="card-body">
              <StatusGroupTabs activeTab={activeTab} tabCounts={tabCounts} onSelect={key => { setActiveTab(key); setPage(1); }} />

              <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                Showing {paged.length} of {sortedData.length} announcements
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Title" sortKey="title" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Date" sortKey="date" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Department" sortKey="department" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Block" sortKey="block" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Created By" sortKey="createdByName" sortConfig={sortConfig} onSort={requestSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No announcements in this status group</td></tr>
                    ) : (
                      paged.map((a, idx) => (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${a.id}`)}>
                          <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                          <td style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</td>
                          <td>{formatDate(a.date)}</td>
                          <td>{a.department || '-'}</td>
                          <td>{a.block || '-'}</td>
                          <td>
                            <span className={`status-badge ${workflowStatusColors[a.workflowStatus]}`}>
                              {workflowStatusLabels[a.workflowStatus]}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{a.createdByName}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function AnnouncementProgressReport() {
  const { announcements } = useScopedAnnouncements();
  const { subComponents } = useAppState();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const visible = useMemo(() => scopeForUser(excludeDrafts(announcements), user), [announcements, user]);

  const filtered = useMemo(() => {
    let data = [...visible];
    if (deptFilter) data = data.filter(a => a.department === deptFilter);
    if (statusFilter) data = data.filter(a => a.workflowStatus === statusFilter);
    if (fromDate) data = data.filter(a => a.date >= fromDate);
    if (toDate) data = data.filter(a => a.date <= toDate);
    return data;
  }, [visible, deptFilter, statusFilter, fromDate, toDate]);

  const { sortedData, sortConfig, requestSort } = useSortableTable(filtered, { key: 'date', direction: 'desc' }, { date: 'date' });

  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const subProgress = useMemo(() => {
    const map = new Map<number, { total: number; completed: number }>();
    for (const sc of subComponents) {
      if (!map.has(sc.announcementId)) map.set(sc.announcementId, { total: 0, completed: 0 });
      const e = map.get(sc.announcementId)!;
      e.total++;
      if (sc.status === 'Completed') e.completed++;
    }
    return map;
  }, [subComponents]);

  const statusOptions: WorkflowStatus[] = ['pending_cmo_review', 'reverted_by_cmo', 'published', 'accepted', 'in_progress', 'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review', 'completed'];

  type ProgressRow = Announcement & { progress: string };
  const exportRows: ProgressRow[] = useMemo(() => sortedData.map(a => {
    const p = subProgress.get(a.id);
    return { ...a, progress: p ? `${p.completed}/${p.total}` : '-' };
  }), [sortedData, subProgress]);

  const exportColumns: ReportColumn<ProgressRow>[] = [
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'district', label: 'District', format: r => r.district ?? '-' },
    { key: 'occasion', label: 'Occasion' },
    { key: 'date', label: 'Date', format: r => formatReportDate(r.date) },
    { key: 'workflowStatus', label: 'Status', format: r => workflowStatusLabels[r.workflowStatus] },
    { key: 'progress', label: 'Sub-Component Progress', align: 'center' },
  ];

  const reportName = 'Announcement Progress Report';
  const filterSummary: string[] = [];
  if (deptFilter) filterSummary.push(`Department: ${deptFilter}`);
  if (statusFilter) filterSummary.push(`Status: ${workflowStatusLabels[statusFilter as WorkflowStatus]}`);
  if (fromDate) filterSummary.push(`From: ${formatReportDate(fromDate)}`);
  if (toDate) filterSummary.push(`To: ${formatReportDate(toDate)}`);
  if (filterSummary.length === 0) filterSummary.push('Scope: All announcements (drafts excluded)');
  filterSummary.push(`Records: ${exportRows.length}`);

  const handleExcel = () => downloadExcel({
    reportName,
    filterSummary,
    sheets: [{ name: 'Announcements', columns: exportColumns, rows: exportRows }],
  });
  const handlePdf = () => downloadPdf({
    reportName,
    filterSummary,
    sections: [{ heading: 'Announcements', columns: exportColumns, rows: exportRows }],
  });

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader title={reportName} onExcel={handleExcel} onPdf={handlePdf} disabled={exportRows.length === 0} />

          <div className="card">
            <div className="card-body">
              <div style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Department</label>
                  <select
                    value={deptFilter}
                    onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }}
                  >
                    <option value="">All Departments</option>
                    {departmentList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }}
                  >
                    <option value="">All Statuses</option>
                    {statusOptions.map(s => <option key={s} value={s}>{workflowStatusLabels[s]}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>From Date</label>
                  <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }} />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>To Date</label>
                  <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 14 }} />
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                Showing {paged.length} of {sortedData.length} announcements
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Title" sortKey="title" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Department" sortKey="department" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="District" sortKey="district" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Occasion" sortKey="occasion" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Date" sortKey="date" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={sortConfig} onSort={requestSort} />
                      <th style={{ textAlign: 'center' }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No announcements match the filters</td></tr>
                    ) : (
                      paged.map((a, idx) => {
                        const prog = subProgress.get(a.id);
                        return (
                          <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${a.id}`)}>
                            <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                            <td style={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</td>
                            <td style={{ fontSize: 12 }}>{a.department}</td>
                            <td>{a.district || '-'}</td>
                            <td style={{ fontSize: 12 }}>{a.occasion}</td>
                            <td>{formatDate(a.date)}</td>
                            <td>
                              <span className={`status-badge ${workflowStatusColors[a.workflowStatus]}`}>
                                {workflowStatusLabels[a.workflowStatus]}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {prog ? (
                                <span style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: prog.completed === prog.total ? '#16a34a' : '#2563eb',
                                }}>
                                  {prog.completed}/{prog.total}
                                </span>
                              ) : (
                                <span style={{ fontSize: 12, color: '#999' }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function OccasionWiseReport() {
  const { announcements } = useScopedAnnouncements();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => scopeForUser(excludeDrafts(announcements), user), [announcements, user]);
  const occasionAgg = useAggregate({ groupBy: 'occasion', draftMode: 'exclude' }, !!user);
  const masterOccasionsQuery = useListOccasions({
    query: { queryKey: getListOccasionsQueryKey(), staleTime: 5 * 60 * 1000 },
  });
  const occasionData = useMemo(() => {
    const computed = mergeBuckets([], occasionAgg.buckets, '(No Occasion)');
    const seen = new Set(computed.map(r => r.name));
    const extras = (masterOccasionsQuery.data?.occasions ?? [])
      .filter(o => o.isActive && !seen.has(o.name))
      .map((o, i) => ({
        id: computed.length + i + 1,
        name: o.name,
        announcement: 0,
        completed: 0,
        inReview: 0,
        inProgress: 0,
        notStarted: 0,
      }));
    return [...computed, ...extras];
  }, [occasionAgg.buckets, masterOccasionsQuery.data]);
  const { sortedData: sortedOccasions, sortConfig: occSortConfig, requestSort: occRequestSort } = useSortableTable(occasionData);

  const occasionAnnouncements = useMemo(
    () => selectedOccasion ? visible.filter(a => a.occasion === selectedOccasion) : [],
    [visible, selectedOccasion]
  );
  const { sortedData: sortedAnns, sortConfig: annSortConfig, requestSort: annRequestSort } = useSortableTable(occasionAnnouncements, { key: 'date', direction: 'desc' }, { date: 'date' });

  const occTotalPages = Math.ceil(sortedOccasions.length / PAGE_SIZE);
  const pagedOccasions = sortedOccasions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const annTotalPages = Math.ceil(sortedAnns.length / PAGE_SIZE);
  const pagedAnns = sortedAnns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summaryColumns: ReportColumn<typeof sortedOccasions[number]>[] = [
    { key: 'name', label: 'Occasion' },
    ...(STATUS_BREAKDOWN_COLUMNS.slice(1) as ReportColumn<typeof sortedOccasions[number]>[]),
  ];
  const detailColumns: ReportColumn<Announcement>[] = [
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'district', label: 'District', format: r => r.district ?? '-' },
    { key: 'date', label: 'Date', format: r => formatReportDate(r.date) },
    { key: 'workflowStatus', label: 'Status', format: r => workflowStatusLabels[r.workflowStatus] },
  ];

  const reportName = selectedOccasion ? `Occasion-wise Report — ${selectedOccasion}` : 'Occasion-wise Report';
  const filterSummary = selectedOccasion ? [`Occasion: ${selectedOccasion}`, `Records: ${sortedAnns.length}`] : [`Scope: All Occasions`, `Records: ${sortedOccasions.length}`];

  const handleExcel = (): Promise<void> => {
    if (selectedOccasion) {
      return downloadExcel({ reportName, filterSummary, sheets: [{ name: 'Announcements', columns: detailColumns, rows: sortedAnns }] });
    }
    return downloadExcel({ reportName, filterSummary, sheets: [{ name: 'Occasions', columns: summaryColumns, rows: sortedOccasions, totalsRow: statusBreakdownTotals(sortedOccasions) }] });
  };
  const handlePdf = (): Promise<void> => {
    if (selectedOccasion) {
      return downloadPdf({ reportName, filterSummary, sections: [{ heading: 'Announcements', columns: detailColumns, rows: sortedAnns }] });
    }
    return downloadPdf({ reportName, filterSummary, sections: [{ heading: 'Occasions', columns: summaryColumns, rows: sortedOccasions, totalsRow: statusBreakdownTotals(sortedOccasions) }] });
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader title={reportName} onExcel={handleExcel} onPdf={handlePdf} disabled={(selectedOccasion ? sortedAnns.length : sortedOccasions.length) === 0} />

          <div style={{ marginBottom: 16, fontSize: 14 }}>
            <span
              style={{ cursor: selectedOccasion ? 'pointer' : 'default', color: selectedOccasion ? '#2563eb' : '#1a3a5c', fontWeight: 600 }}
              onClick={() => { setSelectedOccasion(null); setPage(1); }}
            >
              All Occasions
            </span>
            {selectedOccasion && (
              <>
                <span style={{ margin: '0 8px', color: '#999' }}>/</span>
                <span style={{ fontWeight: 600, color: '#1a3a5c' }}>{selectedOccasion}</span>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-body">
              {!selectedOccasion ? (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Sl No.</th>
                          <SortableHeader label="Occasion" sortKey="name" sortConfig={occSortConfig} onSort={occRequestSort} />
                          <StatusBreakdownHeaders sortConfig={occSortConfig} requestSort={occRequestSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedOccasions.map((row, idx) => (
                          <tr key={row.id}>
                            <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                            <td>
                              <a
                                style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'none', fontWeight: 500 }}
                                onClick={() => { setSelectedOccasion(row.name); setPage(1); }}
                              >
                                {row.name}
                              </a>
                            </td>
                            <StatusBreakdownCells row={row} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls page={page} totalPages={occTotalPages} setPage={setPage} />
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                    Showing {pagedAnns.length} of {sortedAnns.length} announcements
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Sl No.</th>
                          <SortableHeader label="Title" sortKey="title" sortConfig={annSortConfig} onSort={annRequestSort} />
                          <SortableHeader label="Department" sortKey="department" sortConfig={annSortConfig} onSort={annRequestSort} />
                          <SortableHeader label="District" sortKey="district" sortConfig={annSortConfig} onSort={annRequestSort} />
                          <SortableHeader label="Date" sortKey="date" sortConfig={annSortConfig} onSort={annRequestSort} />
                          <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={annSortConfig} onSort={annRequestSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {pagedAnns.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No announcements for this occasion</td></tr>
                        ) : (
                          pagedAnns.map((a, idx) => (
                            <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${a.id}`)}>
                              <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                              <td style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</td>
                              <td style={{ fontSize: 12 }}>{a.department}</td>
                              <td>{a.district || '-'}</td>
                              <td>{formatDate(a.date)}</td>
                              <td>
                                <span className={`status-badge ${workflowStatusColors[a.workflowStatus]}`}>
                                  {workflowStatusLabels[a.workflowStatus]}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls page={page} totalPages={annTotalPages} setPage={setPage} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function AgingAnalysisReport() {
  const { announcements } = useScopedAnnouncements();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bucketFilter, setBucketFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const visible = useMemo(() => scopeForUser(excludeDrafts(announcements), user), [announcements, user]);

  // Per-department aging matrix + bucket distribution come from the uncapped
  // server aging endpoint (count surfaces). The detail rows + row-level KPIs
  // below stay on the (uncapped) scoped announcements, which a detail report
  // legitimately needs. bucketFilter is not sent: the matrix/bar chart always
  // show the full distribution; the detail table narrows by bucket client-side.
  const agingAgg = useAgingAggregate(
    { department: deptFilter || undefined, status: statusFilter || undefined, dateFrom: fromDate || undefined, dateTo: toDate || undefined, draftMode: 'exclude' },
    !!user,
  );

  const allAgingRows: AgingRow[] = useMemo(() => {
    return visible.map(a => {
      const days = getDaysSince(a.date);
      const bi = getBucketIndex(days);
      return {
        id: a.id,
        title: a.title,
        department: a.department,
        workflowStatus: a.workflowStatus,
        date: a.date,
        days,
        bucket: AGING_BUCKETS[bi].label,
        bucketIndex: bi,
      };
    });
  }, [visible]);

  const filteredRows = useMemo(() => {
    let data = allAgingRows;
    if (deptFilter) data = data.filter(r => r.department === deptFilter);
    if (statusFilter) data = data.filter(r => r.workflowStatus === statusFilter);
    if (bucketFilter !== '') data = data.filter(r => String(r.bucketIndex) === bucketFilter);
    if (fromDate) data = data.filter(r => r.date >= fromDate);
    if (toDate) data = data.filter(r => r.date <= toDate);
    return data;
  }, [allAgingRows, deptFilter, statusFilter, bucketFilter, fromDate, toDate]);

  const bucketSummary = useMemo(
    () => [agingAgg.overall.b0, agingAgg.overall.b1, agingAgg.overall.b2, agingAgg.overall.b3],
    [agingAgg.overall],
  );
  const bucketTotal = agingAgg.overall.total;

  const deptAging = useMemo(() => {
    return [...agingAgg.buckets]
      .filter(b => b.key !== '' && b.total > 0)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((b, idx) => ({ id: idx, name: b.key, bucket0: b.b0, bucket1: b.b1, bucket2: b.b2, bucket3: b.b3, total: b.total }));
  }, [agingAgg.buckets]);

  const deptTotals = {
    bucket0: agingAgg.overall.b0,
    bucket1: agingAgg.overall.b1,
    bucket2: agingAgg.overall.b2,
    bucket3: agingAgg.overall.b3,
    grandTotal: agingAgg.overall.total,
  };

  const { sortedData: sortedDeptAging, sortConfig: deptSortConfig, requestSort: deptRequestSort } = useSortableTable(deptAging);

  const { sortedData, sortConfig, requestSort } = useSortableTable(filteredRows, { key: 'days', direction: 'desc' });
  const totalPages = Math.ceil(sortedData.length / PAGE_SIZE);
  const paged = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusOptions: WorkflowStatus[] = ['pending_cmo_review', 'reverted_by_cmo', 'published', 'accepted', 'in_progress', 'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review', 'completed'];

  const totalCount = filteredRows.length;
  const avgAge = useMemo(() => totalCount === 0 ? 0 : Math.round(filteredRows.reduce((sum, r) => sum + r.days, 0) / totalCount), [filteredRows, totalCount]);
  const oldestAge = useMemo(() => totalCount === 0 ? 0 : Math.max(...filteredRows.map(r => r.days)), [filteredRows, totalCount]);
  const overdueCount = useMemo(() => filteredRows.filter(r => r.days > 60).length, [filteredRows]);


  const resetFilters = () => {
    setDeptFilter('');
    setStatusFilter('');
    setBucketFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };
  const filtersActive = !!(deptFilter || statusFilter || bucketFilter !== '' || fromDate || toDate);

  // Export setup
  const breakdownColumns: ReportColumn<typeof sortedDeptAging[number]>[] = [
    { key: 'name', label: 'Department' },
    { key: 'bucket0', label: AGING_BUCKETS[0].label, align: 'center' },
    { key: 'bucket1', label: AGING_BUCKETS[1].label, align: 'center' },
    { key: 'bucket2', label: AGING_BUCKETS[2].label, align: 'center' },
    { key: 'bucket3', label: AGING_BUCKETS[3].label, align: 'center' },
    { key: 'total', label: 'Total', align: 'center' },
  ];
  const breakdownTotals = { name: 'Total', bucket0: deptTotals.bucket0, bucket1: deptTotals.bucket1, bucket2: deptTotals.bucket2, bucket3: deptTotals.bucket3, total: deptTotals.grandTotal };
  const detailColumns: ReportColumn<AgingRow>[] = [
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'workflowStatus', label: 'Status', format: r => workflowStatusLabels[r.workflowStatus] },
    { key: 'date', label: 'Date Created', format: r => formatReportDate(r.date) },
    { key: 'days', label: 'Age (Days)', align: 'center' },
    { key: 'bucket', label: 'Aging Bucket' },
  ];

  const reportName = 'Sankalpa Patra Ageing Analysis Report';
  const filterSummary: string[] = [];
  if (deptFilter) filterSummary.push(`Department: ${deptFilter}`);
  if (statusFilter) filterSummary.push(`Status: ${workflowStatusLabels[statusFilter as WorkflowStatus]}`);
  if (bucketFilter !== '') {
    filterSummary.push(
      `Age Bucket (Detailed Aging only): ${AGING_BUCKETS[parseInt(bucketFilter, 10)].label}`,
      'Department Breakdown: All age buckets',
    );
  }
  if (fromDate) filterSummary.push(`From: ${formatReportDate(fromDate)}`);
  if (toDate) filterSummary.push(`To: ${formatReportDate(toDate)}`);
  if (filterSummary.length === 0) filterSummary.push('Scope: All announcements (drafts excluded)');
  filterSummary.push(
    `Detailed Aging records: ${totalCount}`,
    `Detailed Aging avg: ${avgAge}d`,
    `Detailed Aging oldest: ${oldestAge}d`,
    `Detailed Aging past 60d: ${overdueCount}`,
  );

  const handleExcel = () => new ExcelBuilder(reportName)
    .setFilterSummary(filterSummary)
    .addSheet({ name: 'Department Breakdown', columns: breakdownColumns, rows: sortedDeptAging, totalsRow: breakdownTotals })
    .addSheet({ name: 'Detailed Aging', columns: detailColumns, rows: sortedData })
    .download();
  const handlePdf = () => new PdfBuilder(reportName)
    .setFilterSummary(filterSummary)
    .addSection({ heading: 'Department-wise Aging Breakdown', columns: breakdownColumns, rows: sortedDeptAging, totalsRow: breakdownTotals })
    .addSection({ heading: `Detailed Announcement Aging (${sortedData.length})`, columns: detailColumns, rows: sortedData })
    .download();

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <ReportHeader title={reportName} onExcel={handleExcel} onPdf={handlePdf} disabled={totalCount === 0} />

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
            {[
              { label: 'Total Aged', value: totalCount, color: '#1a3a5c', icon: 'bi-collection' },
              { label: 'Avg Age (Days)', value: avgAge, color: '#2563eb', icon: 'bi-speedometer2' },
              { label: 'Oldest (Days)', value: oldestAge, color: '#dc2626', icon: 'bi-hourglass-bottom' },
              { label: 'Past 60 Days', value: overdueCount, color: '#ea580c', icon: 'bi-exclamation-octagon' },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `${k.color}15`, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  <i className={`bi ${k.icon}`}></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: k.color, lineHeight: 1.1, marginTop: 2 }}>{k.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stacked bar chart */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-body">
              <h5 style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', marginBottom: 14 }}>
                <i className="bi bi-bar-chart-line" style={{ marginRight: 8 }}></i>Age Bucket Distribution
              </h5>
              {bucketFilter !== '' && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: -8, marginBottom: 14 }}>
                  Showing the full age distribution — the selected age-bucket filter applies only to the detailed list below.
                </div>
              )}
              {bucketTotal === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>No data to display</div>
              ) : (
                <>
                  <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    {AGING_BUCKETS.map((b, i) => {
                      const count = bucketSummary[i];
                      const pct = (count / bucketTotal) * 100;
                      if (pct === 0) return null;
                      return (
                        <div
                          key={b.label}
                          title={`${b.label}: ${count} (${pct.toFixed(1)}%)`}
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${b.color}cc, ${b.color})`,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            transition: 'width 0.3s',
                            borderRight: i < AGING_BUCKETS.length - 1 ? '1px solid rgba(255,255,255,0.4)' : 'none',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pct >= 6 ? `${pct.toFixed(0)}%` : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
                    {AGING_BUCKETS.map((b, i) => {
                      const count = bucketSummary[i];
                      const pct = (count / bucketTotal) * 100;
                      return (
                        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: b.color, display: 'inline-block' }}></span>
                          <span style={{ color: '#334155' }}>{b.label}:</span>
                          <span style={{ fontWeight: 700, color: b.color }}>{count}</span>
                          <span style={{ color: '#94a3b8' }}>({pct.toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h5 style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>
                  <i className="bi bi-funnel" style={{ marginRight: 8 }}></i>Filters
                </h5>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <i className="bi bi-x-circle" style={{ marginRight: 4 }}></i>Reset Filters
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>Department</label>
                  <select
                    value={deptFilter}
                    onChange={e => { setDeptFilter(e.target.value); setPage(1); }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="">All Departments</option>
                    {departmentList.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="">All Statuses</option>
                    {statusOptions.map(s => <option key={s} value={s}>{workflowStatusLabels[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>Age Bucket</label>
                  <select
                    value={bucketFilter}
                    onChange={e => { setBucketFilter(e.target.value); setPage(1); }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="">All Buckets</option>
                    {AGING_BUCKETS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>Date Created From</label>
                  <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>Date Created To</label>
                  <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #dee2e6', borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Department breakdown */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-body">
              <h5 style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', marginBottom: 14 }}>
                <i className="bi bi-building" style={{ marginRight: 8 }}></i>Department-wise Aging Breakdown
              </h5>
              {bucketFilter !== '' && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: -8, marginBottom: 14 }}>
                  Showing the full age distribution — the selected age-bucket filter applies only to the detailed list below.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Department" sortKey="name" sortConfig={deptSortConfig} onSort={deptRequestSort} />
                      {AGING_BUCKETS.map((b, i) => (
                        <SortableHeader key={b.label} label={b.label} sortKey={`bucket${i}`} sortConfig={deptSortConfig} onSort={deptRequestSort} className="text-center" />
                      ))}
                      <SortableHeader label="Total" sortKey="total" sortConfig={deptSortConfig} onSort={deptRequestSort} className="text-center" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDeptAging.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No aging data matches the filters</td></tr>
                    ) : sortedDeptAging.map((d, idx) => (
                      <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/reports/department-wise/${encodeURIComponent(d.name)}`)}>
                        <td>{idx + 1}</td>
                        <td>
                          <a style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                            {d.name}
                            <i className="bi bi-arrow-right-circle" style={{ marginLeft: 6 }} />
                          </a>
                        </td>
                        {[d.bucket0, d.bucket1, d.bucket2, d.bucket3].map((count, bi) => (
                          <td key={bi} className="text-center" style={{ color: count > 0 ? AGING_BUCKETS[bi].color : '#cbd5e1', fontWeight: count > 0 ? 600 : 400 }}>
                            {count}
                          </td>
                        ))}
                        <td className="text-center" style={{ fontWeight: 700 }}>{d.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sortedDeptAging.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: '#f1f5f9' }}>
                        <td></td>
                        <td>Total</td>
                        <td className="text-center" style={{ color: AGING_BUCKETS[0].color }}>{deptTotals.bucket0}</td>
                        <td className="text-center" style={{ color: AGING_BUCKETS[1].color }}>{deptTotals.bucket1}</td>
                        <td className="text-center" style={{ color: AGING_BUCKETS[2].color }}>{deptTotals.bucket2}</td>
                        <td className="text-center" style={{ color: AGING_BUCKETS[3].color }}>{deptTotals.bucket3}</td>
                        <td className="text-center">{deptTotals.grandTotal}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* Detailed table */}
          <div className="card">
            <div className="card-body">
              <h5 style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', marginBottom: 14 }}>
                <i className="bi bi-list-ul" style={{ marginRight: 8 }}></i>Detailed Announcement Aging
              </h5>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
                Showing {paged.length} of {sortedData.length} announcements
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Title" sortKey="title" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Department" sortKey="department" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Date Created" sortKey="date" sortConfig={sortConfig} onSort={requestSort} />
                      <SortableHeader label="Age (Days)" sortKey="days" sortConfig={sortConfig} onSort={requestSort} className="text-center" />
                      <SortableHeader label="Aging Bucket" sortKey="bucketIndex" sortConfig={sortConfig} onSort={requestSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 20 }}>No announcements match the filters</td></tr>
                    ) : (
                      paged.map((r, idx) => {
                        const bucket = AGING_BUCKETS[r.bucketIndex];
                        return (
                          <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/announcements/${r.id}`)}>
                            <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                            <td style={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</td>
                            <td style={{ fontSize: 12 }}>{r.department}</td>
                            <td>
                              <span className={`status-badge ${workflowStatusColors[r.workflowStatus]}`}>
                                {workflowStatusLabels[r.workflowStatus]}
                              </span>
                            </td>
                            <td>{formatDate(r.date)}</td>
                            <td className="text-center" style={{ fontWeight: 600, color: bucket.color }}>{r.days}</td>
                            <td>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 10px',
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 600,
                                background: bucket.bg,
                                color: bucket.color,
                                whiteSpace: 'nowrap',
                              }}>
                                {r.bucket}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls page={page} totalPages={totalPages} setPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
