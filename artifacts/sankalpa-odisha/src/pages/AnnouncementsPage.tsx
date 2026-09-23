import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import {
  useListAnnouncements,
  getListAnnouncementsQueryKey,
  type Announcement as ApiAnnouncement,
} from '@workspace/api-client-react';
import { workflowStatusLabels, workflowStatusColors, WorkflowStatus, formatDate } from '@/data/mockData';
import { statusGroups } from '@/data/statusGroups';
import {
  useListDistricts,
  getListDistrictsQueryKey,
  useListDepartments,
  getListDepartmentsQueryKey,
} from '@workspace/api-client-react';
import SortableHeader from '@/components/SortableHeader';
import type { SortConfig } from '@/hooks/useSortableTable';
import { listAnnouncements } from '@workspace/api-client-react';
import { downloadExcel, type ReportColumn } from '@/lib/reportDownloads';

// Single source of truth shared with the dashboard KPI counts and the server
// stats endpoint so a KPI count always equals its drilled-in record list.
const statusGroupMap: Record<string, WorkflowStatus[]> = statusGroups;

const COLUMNS = [
  { key: 'uniqueId', label: 'Unique ID', defaultOn: true },
  { key: 'title', label: 'Title', defaultOn: true },
  { key: 'date', label: 'Date', defaultOn: true },
  { key: 'department', label: 'Department', defaultOn: true },
  { key: 'occasion', label: 'Occasion', defaultOn: true },
  { key: 'location', label: 'Location', defaultOn: true },
  { key: 'district', label: 'District', defaultOn: false },
  { key: 'category', label: 'Category', defaultOn: false },
  { key: 'createdBy', label: 'Created By', defaultOn: false },
  { key: 'workflowStatus', label: 'Status', defaultOn: true },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export default function AnnouncementsPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { user, can } = useAuth();
  const { users } = useAppState();

  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);

  type Filters = { status: string; statusGroup: string; department: string; district: string; dateFrom: string; dateTo: string; search: string };
  const emptyFilters: Filters = { status: '', statusGroup: '', department: '', district: '', dateFrom: '', dateTo: '', search: '' };

  const parseParams = (p: URLSearchParams): Filters => ({
    status: p.get('status') || '',
    statusGroup: p.get('statusGroup') || '',
    department: p.get('department') || '',
    district: p.get('district') || '',
    dateFrom: p.get('dateFrom') || '',
    dateTo: p.get('dateTo') || '',
    search: p.get('search') || '',
  });

  const buildUrl = (f: Filters, page?: number, ps?: number, sort?: SortConfig) => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    if (page && page > 1) p.set('page', String(page));
    if (ps && ps !== 25) p.set('pageSize', String(ps));
    if (sort && sort.key !== 'id') p.set('sortBy', sort.key);
    if (sort && sort.direction !== 'desc') p.set('sortDir', sort.direction);
    const qs = p.toString();
    return qs ? `/announcements?${qs}` : '/announcements';
  };

  const isDeptRole = user && ['dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user'].includes(user.role);

  const [filters, setFilters] = useState<Filters>(() => {
    const f = parseParams(params);
    if (isDeptRole && user?.department && !f.department) f.department = user.department;
    return f;
  });
  const districtsQuery = useListDistricts({ query: { queryKey: getListDistrictsQueryKey() } });
  const districtOptions = useMemo(() => {
    const active = (districtsQuery.data?.districts ?? []).filter((d) => d.isActive).map((d) => d.name);
    if (filters.district && !active.includes(filters.district)) active.push(filters.district);
    return active;
  }, [districtsQuery.data, filters.district]);
  const departmentsQuery = useListDepartments({ query: { queryKey: getListDepartmentsQueryKey() } });
  // Department filter is master-driven: only active departments by default,
  // but the currently-selected value is re-injected so historical filters
  // (and dept-role users locked to a now-disabled department) keep working.
  const departmentOptions = useMemo(() => {
    const active = (departmentsQuery.data?.departments ?? []).filter((d) => d.isActive).map((d) => d.name);
    if (filters.department && !active.includes(filters.department)) active.push(filters.department);
    return active;
  }, [departmentsQuery.data, filters.department]);
  const [currentPage, setCurrentPage] = useState(() => {
    const pg = parseInt(params.get('page') || '1', 10);
    return pg > 0 ? pg : 1;
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    const ps = parseInt(params.get('pageSize') || '25', 10);
    return PAGE_SIZE_OPTIONS.includes(ps as typeof PAGE_SIZE_OPTIONS[number]) ? ps : 25;
  });
  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  const [showFilters, setShowFilters] = useState(() => {
    const f = parseParams(params);
    return Object.entries(f).some(([k, v]) => k !== 'search' && v !== '');
  });

  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(COLUMNS.filter(c => c.defaultOn).map(c => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const sb = params.get('sortBy') || 'id';
    const sd = params.get('sortDir') === 'asc' ? 'asc' : 'desc';
    return { key: sb, direction: sd };
  });

  const handleSort = (key: string) => {
    const next: SortConfig = sortConfig.key === key
      ? { key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' };
    setSortConfig(next);
    setCurrentPage(1);
    setIsInternalUpdate(true);
    navigate(buildUrl(filters, 1, pageSize, next), { replace: true });
  };

  useEffect(() => {
    if (isInternalUpdate) {
      setIsInternalUpdate(false);
      return;
    }
    const f = parseParams(params);
    if (isDeptRole && user?.department && !f.department) f.department = user.department;
    setFilters(f);
    const pg = parseInt(params.get('page') || '1', 10);
    setCurrentPage(pg > 0 ? pg : 1);
    const sb = params.get('sortBy') || 'id';
    const sd = params.get('sortDir') === 'asc' ? 'asc' : 'desc';
    setSortConfig({ key: sb, direction: sd });
    if (Object.entries(f).some(([k, v]) => k !== 'search' && v !== '')) setShowFilters(true);
  }, [searchString]);

  // Build effective server-side status filter (status OR statusGroup expansion)
  const statusListForServer = useMemo(() => {
    if (filters.status) return [filters.status];
    if (filters.statusGroup && statusGroupMap[filters.statusGroup]) return statusGroupMap[filters.statusGroup];
    return [];
  }, [filters.status, filters.statusGroup]);

  // Server-driven query: every filter+page change refires the request.
  const queryParams = useMemo(() => {
    const qp: Record<string, string | number> = { page: currentPage, pageSize, sortBy: sortConfig.key, sortDir: sortConfig.direction };
    if (statusListForServer.length > 0) qp.status = statusListForServer.join(',');
    if (filters.department) qp.department = filters.department;
    if (filters.district) qp.district = filters.district;
    if (filters.dateFrom) qp.dateFrom = filters.dateFrom;
    if (filters.dateTo) qp.dateTo = filters.dateTo;
    if (filters.search) qp.search = filters.search;
    return qp;
  }, [statusListForServer, filters, currentPage, pageSize, sortConfig]);

  const listQuery = useListAnnouncements(queryParams, {
    query: { queryKey: getListAnnouncementsQueryKey(queryParams) },
  });

  const items = listQuery.data?.announcements ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedStart = (safePage - 1) * pageSize;

  const userNameMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of users) map.set(u.id, u.name);
    return map;
  }, [users]);

  const applyFilters = (next: Filters, page = 1) => {
    setFilters(next);
    setCurrentPage(page);
    setIsInternalUpdate(true);
    navigate(buildUrl(next, page, pageSize, sortConfig), { replace: true });
  };

  const updateFilter = (field: string, value: string) => {
    applyFilters({ ...filters, [field]: value });
  };

  const clearFilters = () => {
    const base = { ...emptyFilters };
    if (isDeptRole && user?.department) base.department = user.department;
    applyFilters(base);
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => k !== 'search' && v !== '' && !(k === 'department' && isDeptRole));
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'search' && v && !(k === 'department' && isDeptRole)).length;

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    setIsInternalUpdate(true);
    navigate(buildUrl(filters, page, pageSize, sortConfig), { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push('...');
      const start = Math.max(2, safePage - 1);
      const end = Math.min(totalPages - 1, safePage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safePage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Fetch ALL rows matching the current filters/search/sort (not just the
  // visible page) and build an Excel file with only the selected columns.
  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    // Snapshot the column selection at click time so a long-running export
    // stays deterministic even if the user toggles columns meanwhile.
    const selectedCols = COLUMNS.filter(c => visibleColumns.has(c.key));
    try {
      const EXPORT_PAGE_SIZE = 500; // server-side max
      const MAX_ROWS = 10000; // safety cap
      const all: ApiAnnouncement[] = [];
      let page = 1;
      for (;;) {
        const res = await listAnnouncements({
          ...queryParams,
          page,
          pageSize: EXPORT_PAGE_SIZE,
        });
        all.push(...(res.announcements ?? []));
        const totalRows = res.total ?? all.length;
        if (all.length >= Math.min(totalRows, MAX_ROWS) || (res.announcements ?? []).length === 0) break;
        page += 1;
      }
      const rows = all.slice(0, MAX_ROWS);
      if (rows.length === 0) {
        setExportError('No announcements to export for the current filters.');
        return;
      }
      // Mirror the table cells exactly, including the em-dash fallback.
      const formatters: Record<ColumnKey, (a: ApiAnnouncement) => string> = {
        uniqueId: a => a.uniqueId || '—',
        title: a => a.title || '—',
        date: a => (a.date ? formatDate(a.date) : '—'),
        department: a => a.department || '—',
        occasion: a => a.occasion || '—',
        location: a => a.location || '—',
        district: a => a.district || '—',
        category: a => a.category || '—',
        createdBy: a => userNameMap.get(a.createdBy) || '—',
        workflowStatus: a => workflowStatusLabels[a.workflowStatus as WorkflowStatus] || a.workflowStatus || '—',
      };
      type ExportRow = Record<string, string | number>;
      const exportRows: ExportRow[] = rows.map((a, i) => {
        const rec: ExportRow = { slNo: i + 1 };
        for (const c of selectedCols) rec[c.key] = formatters[c.key](a);
        return rec;
      });
      const columns: ReportColumn<ExportRow>[] = [
        { key: 'slNo', label: 'Sl No.', align: 'right' },
        ...selectedCols.map(c => ({ key: c.key as string, label: c.label })),
      ];
      await downloadExcel({
        reportName: 'HCM Announcements',
        sheets: [{ name: 'Announcements', columns, rows: exportRows }],
      });
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const renderRow = (item: ApiAnnouncement, idx: number) => {
    const status = item.workflowStatus as WorkflowStatus;
    return (
      <tr key={item.id} className="clickable-row" onClick={() => navigate(`/announcements/${item.id}`)}>
        <td>{paginatedStart + idx + 1}</td>
        {visibleColumns.has('uniqueId') && <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#e87722', whiteSpace: 'nowrap' }}>{item.uniqueId}</td>}
        {visibleColumns.has('title') && <td style={{ color: '#1a3a5c', fontWeight: 500 }}>{item.title}</td>}
        {visibleColumns.has('date') && <td>{formatDate(item.date)}</td>}
        {visibleColumns.has('department') && <td>{item.department || '—'}</td>}
        {visibleColumns.has('occasion') && <td>{item.occasion || '—'}</td>}
        {visibleColumns.has('location') && <td>{item.location || '—'}</td>}
        {visibleColumns.has('district') && <td>{item.district || '—'}</td>}
        {visibleColumns.has('category') && <td>{item.category || '—'}</td>}
        {visibleColumns.has('createdBy') && <td style={{ fontSize: 12 }}>{userNameMap.get(item.createdBy) || '—'}</td>}
        {visibleColumns.has('workflowStatus') && (
          <td>
            <span className={`status-badge ${workflowStatusColors[status]}`}>
              {workflowStatusLabels[status]}
            </span>
          </td>
        )}
        <td>
          <i className="bi bi-eye" style={{ color: '#1a3a5c' }}></i>
        </td>
      </tr>
    );
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <h4>HCM Announcement</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn-filter-toggle"
                onClick={() => setShowFilters(!showFilters)}
              >
                <i className={`bi ${showFilters ? 'bi-funnel-fill' : 'bi-funnel'}`}></i>
                Filters
                {hasActiveFilters && <span className="filter-badge">{activeFilterCount}</span>}
              </button>
              {can('create_announcement') && (
                <button className="btn-add" onClick={() => navigate('/announcements/add')}>
                  <i className="bi bi-plus-lg"></i> Add HCM Announcement
                </button>
              )}
            </div>
          </div>

          <div className="table-toolbar">
            <div className="table-search-bar">
              <i className="bi bi-search table-search-icon"></i>
              <input
                type="text"
                className="table-search-input"
                placeholder="Search announcements…"
                value={filters.search}
                onChange={e => updateFilter('search', e.target.value)}
              />
              {filters.search && (
                <button className="table-search-clear" onClick={() => updateFilter('search', '')} title="Clear search">
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn-col-picker"
              onClick={handleExportExcel}
              disabled={exporting || listQuery.isLoading || total === 0}
              title={total === 0 ? 'No announcements to export' : 'Download Excel with the selected columns and current filters'}
              style={{ opacity: exporting || total === 0 ? 0.6 : 1, cursor: exporting || total === 0 ? 'not-allowed' : 'pointer' }}
            >
              {exporting ? (
                <><i className="bi bi-arrow-repeat" style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}></i> Preparing…</>
              ) : (
                <><i className="bi bi-download"></i> Download</>
              )}
            </button>
            <div className="col-picker-wrapper">
              <button className="btn-col-picker" onClick={() => setShowColPicker(v => !v)}>
                <i className="bi bi-layout-three-columns"></i> Columns <i className="bi bi-chevron-down" style={{ fontSize: 11, marginLeft: 2 }}></i>
              </button>
              {showColPicker && (
                <div className="col-picker-dropdown">
                  {COLUMNS.map(col => (
                    <label key={col.key} className="col-picker-item" style={col.key === 'title' ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(col.key)}
                        disabled={col.key === 'title'}
                        onChange={e => {
                          setVisibleColumns(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(col.key);
                            else next.delete(col.key);
                            return next;
                          });
                        }}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {exportError && (
            <div style={{ margin: '6px 0 0', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="bi bi-exclamation-triangle"></i>
              {exportError}
              <button type="button" onClick={() => setExportError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }} title="Dismiss">
                <i className="bi bi-x"></i>
              </button>
            </div>
          )}

          {showFilters && (
            <div className="filter-panel">
              <div className="filter-grid">
                <div className="filter-group">
                  <label>Status</label>
                  <select value={filters.status} onChange={e => {
                    const val = e.target.value;
                    applyFilters({ ...filters, status: val, ...(val ? { statusGroup: '' } : {}) });
                  }}>
                    <option value="">All Statuses</option>
                    {(Object.keys(workflowStatusLabels) as WorkflowStatus[])
                      .filter(key => {
                        const role = user?.role;
                        if (isDeptRole) {
                          return !(['draft', 'pending_cmo_review', 'reverted_by_cmo'] as WorkflowStatus[]).includes(key);
                        }
                        if (role === 'cmo_nodal') {
                          return !(['reverted_by_dept_reviewer'] as WorkflowStatus[]).includes(key);
                        }
                        if (role === 'chief_minister' || role === 'ocac_viewer' || role === 'cmo_reviewer') {
                          return key !== 'draft';
                        }
                        return true;
                      })
                      .map(key => (
                        <option key={key} value={key}>{workflowStatusLabels[key]}</option>
                      ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label>Department</label>
                  <select
                    value={filters.department}
                    onChange={e => updateFilter('department', e.target.value)}
                    disabled={!!isDeptRole}
                  >
                    <option value="">All Departments</option>
                    {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <label>District</label>
                  <select
                    value={filters.district}
                    onChange={e => updateFilter('district', e.target.value)}
                  >
                    <option value="">All Districts</option>
                    {districtOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div className="filter-group">
                  <label>From Date</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={e => updateFilter('dateFrom', e.target.value)}
                  />
                </div>

                <div className="filter-group">
                  <label>To Date</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={e => updateFilter('dateTo', e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-actions">
                {hasActiveFilters && (
                  <button className="btn-clear-filters" onClick={clearFilters}>
                    <i className="bi bi-x-circle"></i> Clear All Filters
                  </button>
                )}
                <span className="filter-count">{total} announcements</span>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      {COLUMNS.filter(c => visibleColumns.has(c.key)).map(c => (
                        <SortableHeader
                          key={c.key}
                          label={c.label}
                          sortKey={c.key}
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        />
                      ))}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.isLoading ? (
                      <tr>
                        <td colSpan={2 + visibleColumns.size} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                          Loading…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={2 + visibleColumns.size} style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                          No announcements found.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => renderRow(item, idx))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <div className="pagination-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span>
                    Showing {total === 0 ? 0 : paginatedStart + 1}
                    –{Math.min(paginatedStart + pageSize, total)}
                    {' '}of {total}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                    Page size
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        const ps = parseInt(e.target.value, 10);
                        setPageSize(ps);
                        setCurrentPage(1);
                        setIsInternalUpdate(true);
                        navigate(buildUrl(filters, 1, ps, sortConfig), { replace: true });
                      }}
                      style={{ padding: '2px 6px' }}
                    >
                      {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                {totalPages > 1 && (
                  <div className="pagination-controls">
                    <button
                      className="pagination-btn"
                      disabled={safePage <= 1}
                      onClick={() => goToPage(1)}
                      title="First page"
                    >
                      <i className="bi bi-chevron-double-left"></i>
                    </button>
                    <button
                      className="pagination-btn"
                      disabled={safePage <= 1}
                      onClick={() => goToPage(safePage - 1)}
                      title="Previous page"
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                    {getPageNumbers().map((pg, i) =>
                      pg === '...' ? (
                        <span key={`ellipsis-${i}`} className="pagination-ellipsis">...</span>
                      ) : (
                        <button
                          key={pg}
                          className={`pagination-btn ${pg === safePage ? 'active' : ''}`}
                          onClick={() => goToPage(pg)}
                        >
                          {pg}
                        </button>
                      )
                    )}
                    <button
                      className="pagination-btn"
                      disabled={safePage >= totalPages}
                      onClick={() => goToPage(safePage + 1)}
                      title="Next page"
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                    <button
                      className="pagination-btn"
                      disabled={safePage >= totalPages}
                      onClick={() => goToPage(totalPages)}
                      title="Last page"
                    >
                      <i className="bi bi-chevron-double-right"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
