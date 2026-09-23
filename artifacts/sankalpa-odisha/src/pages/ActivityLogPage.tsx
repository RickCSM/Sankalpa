import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useAppState } from '@/context/AppStateContext';
import { roleLabels } from '@/data/mockData';
import { useListAuditLog, getListAuditLogQueryKey } from '@workspace/api-client-react';
import SortableHeader from '@/components/SortableHeader';
import type { SortConfig } from '@/hooks/useSortableTable';
import AuditLogDetailModal from '@/components/AuditLogDetailModal';

const PAGE_SIZE = 25;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Friendly labels for known audit actions. Keys here also drive the Action
// dropdown — any action that lands in the audit log should be listed here so
// admins can filter by it without having to remember the raw key.
const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Logged In',
  'auth.logout': 'Logged Out',
  'auth.login_failed': 'Failed Login Attempt',
  'auth.change_password': 'Password Changed',
  'auth.admin_reset_password': 'Admin Reset Password',
  'announcement.create': 'Announcement Created',
  'announcement.update': 'Announcement Edited',
  'announcement.delete': 'Announcement Deleted',
  'announcement.submit': 'Submitted for Review',
  'announcement.review': 'CMO Review',
  'announcement.accept': 'Dept Nodal Accepted',
  'announcement.final_accept': 'Dept Reviewer Final Accept',
  'announcement.assign': 'Assigned',
  'announcement.reassign': 'Reassigned',
  'announcement.start_progress': 'Started Progress',
  'announcement.request_completion': 'Completion Requested',
  'announcement.review_completion': 'Completion Review',
  'announcement.review_cmo_completion': 'CMO Completion Review',
  'announcement.complete': 'Completed',
  'announcement.drop': 'Dropped',
  'announcement.hold': 'Put On Hold',
  'subcomponent.create': 'Sub-component Added',
  'subcomponent.update': 'Sub-component Updated',
  'subcomponent.delete': 'Sub-component Deleted',
  'attachment.post': 'Attachment Added',
  'attachment.delete': 'Attachment Removed',
  'announcement_comments.post': 'Comment Posted',
  'users.post': 'User Created',
  'users.patch': 'User Updated',
  'users.delete': 'User Deleted',
  'departments.post': 'Department Created',
  'departments.patch': 'Department Updated',
  'departments.delete': 'Department Deleted',
  'categories.post': 'Category Created',
  'categories.patch': 'Category Updated',
  'categories.delete': 'Category Deleted',
  'tags.post': 'Tag Created',
  'tags.patch': 'Tag Updated',
  'tags.delete': 'Tag Deleted',
  'notification.patch': 'Notification Updated',
};

function summarizeAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function getActionBadgeClass(action: string): string {
  if (action === 'auth.login_failed') return 'on-hold';
  if (action.includes('delete') || action.includes('drop')) return 'on-hold';
  if (action.includes('review_completion') || action.includes('review_cmo_completion')) return 'in-review';
  if (action.includes('final_accept') || action === 'announcement.complete') return 'completed';
  if (action.includes('accept')) return 'accepted';
  if (action.includes('create') || action.includes('submit') || action === 'users.post' || action === 'departments.post') return 'in-review';
  if (action.includes('start_progress')) return 'in-progress';
  if (action.includes('update') || action.includes('patch')) return 'published';
  return 'published';
}

function buildExportUrl(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return `/api/audit-log/export${qs ? `?${qs}` : ''}`;
}

export default function ActivityLogPage() {
  const [, navigate] = useLocation();
  const { can } = useAuth();
  const { announcements, users } = useAppState();

  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id', direction: 'desc' });
  const [detailEntryId, setDetailEntryId] = useState<number | null>(null);

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
    setPage(1);
  };

  const canView = can('view_audit_log');

  const announcementMap = useMemo(() => {
    const map = new Map<number, { title: string }>();
    announcements.forEach(a => map.set(a.id, { title: a.title }));
    return map;
  }, [announcements]);

  const userMap = useMemo(() => {
    const map = new Map<number, { name: string; role: string }>();
    users.forEach(u => map.set(u.id, { name: u.name, role: u.role }));
    return map;
  }, [users]);

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;

  const auditParams = {
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortConfig.key,
    sortDir: sortConfig.direction,
    ...(selectedUserId !== '' ? { actorId: selectedUserId as number } : {}),
    ...(selectedRole ? { actorRole: selectedRole } : {}),
    ...(selectedAction ? { action: selectedAction } : {}),
    ...(selectedTarget ? { targetTable: selectedTarget } : {}),
    ...(searchText.trim() ? { search: searchText.trim() } : {}),
    ...(fromIso ? { from: fromIso } : {}),
    ...(toIso ? { to: toIso } : {}),
  };

  const { data, isLoading, error } = useListAuditLog(
    auditParams,
    {
      query: {
        enabled: canView,
        queryKey: getListAuditLogQueryKey(auditParams),
      },
    },
  );

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleUserChange = (val: string) => {
    setSelectedUserId(val === '' ? '' : parseInt(val));
    setPage(1);
  };
  const handleRoleChange = (val: string) => { setSelectedRole(val); setPage(1); };
  const handleActionChange = (val: string) => { setSelectedAction(val); setPage(1); };
  const handleTargetChange = (val: string) => { setSelectedTarget(val); setPage(1); };
  const handleFromDateChange = (val: string) => { setFromDate(val); setPage(1); };
  const handleToDateChange = (val: string) => { setToDate(val); setPage(1); };
  const handleSearchChange = (val: string) => { setSearchText(val); setPage(1); };

  const handleClearFilters = () => {
    setSelectedUserId(''); setSelectedRole(''); setSelectedAction('');
    setSelectedTarget(''); setFromDate(''); setToDate(''); setSearchText('');
    setPage(1);
  };

  // Roles that the audit log can actually contain. We list every role in
  // the application plus the synthetic 'anonymous' role used for
  // pre-authentication events (failed logins).
  const ROLE_OPTIONS = [
    'admin', 'chief_minister', 'cmo_nodal', 'cmo_reviewer', 'ocac_viewer',
    'dept_head', 'dept_nodal', 'dept_reviewer', 'dept_user', 'dept_viewer',
    'anonymous',
  ];

  const ACTION_OPTIONS = useMemo(() => {
    return Object.keys(ACTION_LABELS).sort((a, b) => a.localeCompare(b));
  }, []);

  const uniqueTargets = [
    'announcements',
    'announcement_attachments',
    'announcement_comments',
    'subcomponents',
    'users',
    'departments',
    'categories',
    'tags',
    'auth',
  ];

  const exportUrl = useMemo(() => buildExportUrl({
    ...(selectedUserId !== '' ? { actorId: String(selectedUserId) } : {}),
    ...(selectedRole ? { actorRole: selectedRole } : {}),
    ...(selectedAction ? { action: selectedAction } : {}),
    ...(selectedTarget ? { targetTable: selectedTarget } : {}),
    ...(searchText.trim() ? { search: searchText.trim() } : {}),
    ...(fromIso ? { from: fromIso } : {}),
    ...(toIso ? { to: toIso } : {}),
  }), [selectedUserId, selectedRole, selectedAction, selectedTarget, searchText, fromIso, toIso]);

  const detailEntry = useMemo(() => {
    if (detailEntryId === null) return null;
    return entries.find(e => e.id === detailEntryId) ?? null;
  }, [detailEntryId, entries]);

  if (!canView) {
    return <Layout><div className="page-container"><p>Access denied.</p></div></Layout>;
  }

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <h4>Activity Log</h4>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <div className="form-grid" style={{ marginBottom: 0 }}>
                <div className="form-group">
                  <label>Filter by User</label>
                  <select value={selectedUserId} onChange={e => handleUserChange(e.target.value)}>
                    <option value="">All Users</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({roleLabels[u.role]})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Filter by Role</label>
                  <select value={selectedRole} onChange={e => handleRoleChange(e.target.value)}>
                    <option value="">All Roles</option>
                    {ROLE_OPTIONS.map(r => (
                      <option key={r} value={r}>
                        {roleLabels[r as keyof typeof roleLabels] ?? r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Filter by Action</label>
                  <select value={selectedAction} onChange={e => handleActionChange(e.target.value)}>
                    <option value="">All Actions</option>
                    {ACTION_OPTIONS.map(a => (
                      <option key={a} value={a}>{summarizeAction(a)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Filter by Target</label>
                  <select value={selectedTarget} onChange={e => handleTargetChange(e.target.value)}>
                    <option value="">All Targets</option>
                    {uniqueTargets.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => handleFromDateChange(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => handleToDateChange(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Search</label>
                  <input
                    type="text"
                    placeholder="Search route, action, target…"
                    value={searchText}
                    onChange={e => handleSearchChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#666' }}>
                  {isLoading
                    ? 'Loading…'
                    : `Showing ${entries.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–${Math.min((page - 1) * PAGE_SIZE + entries.length, total)} of ${total} entries`}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    style={{ padding: '6px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#374151' }}
                  >
                    Clear Filters
                  </button>
                  <a
                    href={exportUrl}
                    download
                    style={{ padding: '6px 12px', background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                  >
                    <i className="bi bi-download" style={{ marginRight: 4 }}></i>
                    Export CSV
                  </a>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 12, borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
                  Failed to load audit log.
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sl No.</th>
                      <SortableHeader label="Timestamp" sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Actor" sortKey="actorName" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Role" sortKey="actorRole" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Action" sortKey="action" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Target" sortKey="targetTable" sortConfig={sortConfig} onSort={handleSort} />
                      <th>IP</th>
                      <SortableHeader label="Route" sortKey="route" sortConfig={sortConfig} onSort={handleSort} />
                      <th style={{ width: 60 }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', color: '#999', padding: 24 }}>
                          No audit entries match the current filters.
                        </td>
                      </tr>
                    ) : (
                      entries.map((e, idx) => {
                        const actor = e.actorName ?? (e.actorId != null ? userMap.get(e.actorId)?.name : null) ?? (e.actorRole === 'anonymous' ? '—' : `User #${e.actorId ?? '?'}`);
                        const ann = e.targetTable === 'announcements' && e.targetId
                          ? announcementMap.get(e.targetId)
                          : null;
                        return (
                          <tr key={e.id}>
                            <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatTimestamp(e.createdAt as unknown as string)}</td>
                            <td style={{ fontWeight: 600 }}>{actor}</td>
                            <td>
                              <span className="status-badge in-progress" style={{ fontSize: 11 }}>
                                {roleLabels[e.actorRole as keyof typeof roleLabels] ?? e.actorRole}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${getActionBadgeClass(e.action)}`} style={{ fontSize: 11 }}>
                                {summarizeAction(e.action)}
                              </span>
                            </td>
                            <td style={{ fontSize: 13 }}>
                              {ann ? (
                                <a
                                  style={{ color: '#1a3a5c', cursor: 'pointer', textDecoration: 'underline' }}
                                  onClick={() => navigate(`/announcements/${e.targetId}`)}
                                >
                                  {ann.title}
                                </a>
                              ) : (
                                <span style={{ color: '#666' }}>
                                  {e.targetTable}{e.targetId ? ` #${e.targetId}` : ''}
                                </span>
                              )}
                            </td>
                            <td
                              title={e.ip ?? ''}
                              style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {e.ip ?? '—'}
                            </td>
                            <td style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                              {e.method} {e.route}
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setDetailEntryId(e.id)}
                                aria-label="View details"
                                title="View details"
                                style={{ padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#1a3a5c' }}
                              >
                                <i className="bi bi-eye"></i>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination-bar">
                  <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <i className="bi bi-chevron-left"></i> Prev
                  </button>
                  <span className="pagination-info">Page {page} of {totalPages}</span>
                  <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {detailEntry && (
        <AuditLogDetailModal
          entry={detailEntry}
          actionLabel={summarizeAction(detailEntry.action)}
          roleLabel={roleLabels[detailEntry.actorRole as keyof typeof roleLabels] ?? detailEntry.actorRole}
          onClose={() => setDetailEntryId(null)}
        />
      )}
    </Layout>
  );
}
