import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQueries } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import {
  useListAnnouncements,
  getListAnnouncementsQueryKey,
  listAnnouncements,
  type Announcement as ApiAnnouncement,
} from '@workspace/api-client-react';
import { workflowStatusLabels, workflowStatusColors, formatDate, POST_PUBLICATION_STATUSES, type WorkflowStatus } from '@/data/mockData';
import SortableHeader from '@/components/SortableHeader';
import type { SortConfig } from '@/hooks/useSortableTable';
import type { ListAnnouncementsParams } from '@workspace/api-client-react';

type SectionType = 'action' | 'info' | 'completed';

interface TabSpec {
  title: string;
  type: SectionType;
  statuses: WorkflowStatus[];
  scope: Record<string, string | number>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }
  return pages;
}

function typeColor(type: SectionType) {
  return type === 'action' ? '#e67e22' : type === 'completed' ? '#27ae60' : '#1a3a5c';
}

function buildTabs(role: string, userId: number, department?: string): TabSpec[] {
  const deptScope: Record<string, string | number> = department ? { department } : {};
  switch (role) {
    case 'cmo_nodal':
      return [
        { title: 'Action Required', type: 'action', statuses: ['draft', 'reverted_by_cmo', 'pending_cmo_reconsideration'], scope: { createdBy: userId } },
        { title: 'Awaiting CMO Review', type: 'info', statuses: ['pending_cmo_review'], scope: { createdBy: userId } },
        { title: 'Assign Sub-components', type: 'action', statuses: ['pending_dept_acceptance'], scope: { createdBy: userId } },
        { title: 'In Department', type: 'info', statuses: ['published', 'accepted', 'in_progress', 'pending_completion_review', 'pending_cmo_completion_review'], scope: { createdBy: userId } },
        { title: 'Completed', type: 'completed', statuses: ['completed'], scope: { createdBy: userId } },
      ];
    case 'cmo_reviewer':
      return [
        { title: 'Pending My Review', type: 'action', statuses: ['pending_cmo_review'], scope: { assignedCmoReviewerId: userId } },
        { title: 'Pending Completion Review', type: 'action', statuses: ['pending_cmo_completion_review'], scope: { assignedCmoReviewerId: userId } },
        { title: 'On Hold', type: 'action', statuses: ['on_hold'], scope: { assignedCmoReviewerId: userId, statusBeforeHold: POST_PUBLICATION_STATUSES.join(',') } },
        { title: 'Recently Reviewed', type: 'info', statuses: ['published', 'reverted_by_cmo', 'completed'], scope: { assignedCmoReviewerId: userId } },
      ];
    case 'dept_nodal':
      return [
        { title: 'Needs Acceptance', type: 'action', statuses: ['published'], scope: deptScope },
        { title: 'Awaiting Final Acceptance', type: 'info', statuses: ['pending_dept_acceptance'], scope: deptScope },
        { title: 'Needs Rework', type: 'action', statuses: ['reverted_by_dept_reviewer'], scope: deptScope },
        { title: 'In Progress', type: 'info', statuses: ['accepted', 'in_progress'], scope: deptScope },
        { title: 'Awaiting Completion Review', type: 'info', statuses: ['pending_completion_review', 'pending_cmo_completion_review'], scope: deptScope },
        { title: 'Completed', type: 'completed', statuses: ['completed'], scope: deptScope },
      ];
    case 'dept_reviewer':
      return [
        { title: 'Awaiting Dept Acceptance', type: 'info', statuses: ['published'], scope: deptScope },
        { title: 'Pending Final Acceptance', type: 'action', statuses: ['pending_dept_acceptance'], scope: deptScope },
        { title: 'In Progress', type: 'info', statuses: ['accepted', 'in_progress', 'reverted_by_dept_reviewer'], scope: deptScope },
        { title: 'Pending Completion Review', type: 'action', statuses: ['pending_completion_review'], scope: deptScope },
        { title: 'Awaiting CMO Review', type: 'info', statuses: ['pending_cmo_completion_review'], scope: deptScope },
        { title: 'Recently Reviewed', type: 'info', statuses: ['completed'], scope: deptScope },
      ];
    case 'dept_head':
      return [
        { title: 'Active', type: 'info', statuses: ['pending_cmo_review', 'reverted_by_cmo', 'published', 'accepted', 'pending_dept_acceptance', 'in_progress', 'pending_completion_review', 'reverted_by_dept_reviewer', 'pending_cmo_completion_review'], scope: deptScope },
        { title: 'Completed', type: 'completed', statuses: ['completed'], scope: deptScope },
      ];
    case 'dept_user':
      return [
        { title: 'Incoming', type: 'info', statuses: ['published', 'pending_dept_acceptance'], scope: deptScope },
        { title: 'Active', type: 'action', statuses: ['accepted', 'in_progress', 'reverted_by_dept_reviewer'], scope: deptScope },
        { title: 'Completed', type: 'completed', statuses: ['completed'], scope: deptScope },
      ];
    case 'admin':
      return [
        { title: 'Needs CMO Review', type: 'action', statuses: ['pending_cmo_review'], scope: {} },
        { title: 'Needs Dept Acceptance', type: 'action', statuses: ['published'], scope: {} },
        { title: 'Needs Rework', type: 'action', statuses: ['reverted_by_cmo', 'reverted_by_dept_reviewer'], scope: {} },
        { title: 'Needs Completion Review', type: 'action', statuses: ['pending_completion_review'], scope: {} },
        { title: 'Needs CMO Completion Review', type: 'action', statuses: ['pending_cmo_completion_review'], scope: {} },
        { title: 'On Hold', type: 'action', statuses: ['on_hold'], scope: {} },
        { title: 'My Drafts', type: 'info', statuses: ['draft'], scope: { createdBy: userId } },
      ];
    case 'chief_minister':
    case 'ocac_viewer':
      return [
        { title: 'Pending Reviews', type: 'info', statuses: ['pending_cmo_review', 'pending_completion_review', 'pending_cmo_completion_review'], scope: {} },
        { title: 'In Progress', type: 'info', statuses: ['accepted', 'in_progress'], scope: {} },
        { title: 'Completed', type: 'completed', statuses: ['completed'], scope: {} },
      ];
    default:
      return [];
  }
}

function buildParams(tab: TabSpec, page: number, pageSize: number): Record<string, string | number> {
  return {
    page,
    pageSize,
    status: tab.statuses.join(','),
    ...tab.scope,
  };
}

export default function MyActionsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id', direction: 'desc' });

  const handleSort = (key: string) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
    setCurrentPage(1);
  };

  const tabs = useMemo<TabSpec[]>(
    () => (user ? buildTabs(user.role, user.id, user.department ?? undefined) : []),
    [user],
  );

  // One lightweight query per tab (pageSize=1) just to fetch `total` so the
  // tab badges show counts without prefetching all rows.
  const countQueries = useQueries({
    queries: tabs.map(tab => {
      const params = buildParams(tab, 1, 1);
      return {
        queryKey: getListAnnouncementsQueryKey(params),
        queryFn: () => listAnnouncements(params),
        enabled: !!user,
        staleTime: 10_000,
      };
    }),
  });

  const safeTab = Math.min(activeTab, Math.max(0, tabs.length - 1));
  const currentTab: TabSpec | undefined = tabs[safeTab];

  // Server-driven page query for the active tab.
  const activeParams = useMemo<ListAnnouncementsParams | null>(
    () => currentTab
      ? { ...buildParams(currentTab, currentPage, pageSize) as ListAnnouncementsParams, sortBy: sortConfig.key, sortDir: sortConfig.direction }
      : null,
    [currentTab, currentPage, pageSize, sortConfig],
  );
  const fallbackParams = { page: 1, pageSize: 1, sortBy: 'id', sortDir: 'desc' as const };
  const activeQuery = useListAnnouncements(activeParams ?? fallbackParams, {
    query: {
      queryKey: getListAnnouncementsQueryKey(activeParams ?? fallbackParams),
      enabled: !!activeParams,
      placeholderData: (prev) => prev,
    },
  });

  const items: ApiAnnouncement[] = activeQuery.data?.announcements ?? [];
  const total = activeQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;

  const actionCount = tabs.reduce((sum, tab, idx) => {
    if (tab.type !== 'action') return sum;
    const cnt = countQueries[idx]?.data?.total ?? 0;
    return sum + cnt;
  }, 0);

  const switchTab = (idx: number) => {
    setActiveTab(idx);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header">
            <div>
              <h4>My Actions</h4>
              {tabs.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                  {actionCount > 0
                    ? <><span style={{ color: '#e67e22', fontWeight: 600 }}>{actionCount} item{actionCount !== 1 ? 's' : ''}</span> require your attention</>
                    : 'All caught up — no actions needed right now.'}
                </p>
              )}
            </div>
          </div>

          {tabs.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <i className="bi bi-clipboard-check" style={{ fontSize: 40, display: 'block', marginBottom: 12, opacity: 0.4 }}></i>
                <p style={{ margin: 0, fontSize: 15 }}>No actions available right now.</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="my-actions-tabs">
                {tabs.map((tab, idx) => {
                  const cnt = countQueries[idx]?.data?.total ?? 0;
                  return (
                    <button
                      key={tab.title}
                      className={`my-actions-tab ${idx === safeTab ? 'active' : ''}`}
                      onClick={() => switchTab(idx)}
                      style={{ '--tab-color': typeColor(tab.type) } as React.CSSProperties}
                    >
                      <span className="my-actions-tab-label">{tab.title}</span>
                      <span className="my-actions-count-badge" style={{ background: typeColor(tab.type) }}>
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeQuery.isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>Loading…</div>
              ) : items.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>Sl No.</th>
                        <SortableHeader label="Title" sortKey="title" sortConfig={sortConfig} onSort={handleSort} />
                        <SortableHeader label="Date" sortKey="date" sortConfig={sortConfig} onSort={handleSort} style={{ width: 110 }} />
                        <SortableHeader label="Department" sortKey="department" sortConfig={sortConfig} onSort={handleSort} />
                        <SortableHeader label="Status" sortKey="workflowStatus" sortConfig={sortConfig} onSort={handleSort} style={{ width: 200 }} />
                        <th style={{ width: 60 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className="clickable-row"
                          onClick={() => navigate(`/announcements/${item.id}`)}
                        >
                          <td>{start + idx + 1}</td>
                          <td style={{ color: '#1a3a5c', fontWeight: 500 }}>{item.title}</td>
                          <td>{formatDate(item.date)}</td>
                          <td>{item.department || '—'}</td>
                          <td>
                            <span className={`status-badge ${workflowStatusColors[item.workflowStatus as WorkflowStatus]}`}>
                              {workflowStatusLabels[item.workflowStatus as WorkflowStatus]}
                            </span>
                          </td>
                          <td>
                            <i className="bi bi-eye" style={{ color: '#1a3a5c' }}></i>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="pagination-bar" style={{ padding: '12px 16px' }}>
                    <div className="pagination-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span>Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        Rows per page:
                        <select
                          value={pageSize}
                          onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                          style={{ padding: '2px 6px', fontSize: 13 }}
                        >
                          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    </div>
                    {totalPages > 1 && (
                      <div className="pagination-controls">
                        <button className="pagination-btn" disabled={safePage <= 1} onClick={() => goToPage(1)}>
                          <i className="bi bi-chevron-double-left"></i>
                        </button>
                        <button className="pagination-btn" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        {getPageNumbers(safePage, totalPages).map((pg, i) =>
                          typeof pg === 'string' ? (
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
                        <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => goToPage(safePage + 1)}>
                          <i className="bi bi-chevron-right"></i>
                        </button>
                        <button className="pagination-btn" disabled={safePage >= totalPages} onClick={() => goToPage(totalPages)}>
                          <i className="bi bi-chevron-double-right"></i>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
                  <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }}></i>
                  <p style={{ margin: 0, fontSize: 14 }}>No items in this tab.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
