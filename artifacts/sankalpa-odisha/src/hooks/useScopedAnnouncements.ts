import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listAnnouncements,
  type Announcement as ApiAnnouncement,
  type ListAnnouncementsParams,
} from '@workspace/api-client-react';
import type { Announcement, WorkflowStatus } from '@/data/mockData';
import { fetchAllPages } from '@/lib/fetchAllPages';

function apiToLocal(a: ApiAnnouncement): Announcement {
  return {
    id: a.id,
    uniqueId: a.uniqueId,
    house: a.house ?? null,
    constituencyNumber: a.constituencyNumber ?? null,
    title: a.title,
    date: a.date,
    description: a.description,
    department: a.department ?? '',
    occasion: a.occasion ?? '',
    location: a.location ?? '',
    district: a.district ?? undefined,
    block: a.block ?? undefined,
    category: a.category ?? undefined,
    tags: a.tags ?? [],
    workflowStatus: a.workflowStatus as WorkflowStatus,
    createdBy: a.createdBy,
    assignedDeptUserId: a.assignedDeptUserId ?? undefined,
    assignedCmoReviewerId: a.assignedCmoReviewerId ?? undefined,
    acceptedByDeptNodalId: a.acceptedByDeptNodalId ?? undefined,
    reconsiderationRequested: a.reconsiderationRequested ?? false,
  } as Announcement;
}

/**
 * Per-consumer scoped announcements query. Each call site supplies its own
 * filter set (status, department, etc) and gets back the COMPLETE, uncapped
 * server-driven result for those filters by paging through every page.
 *
 * This is what lets reports compute accurate totals over the whole visible
 * dataset instead of only the most recent page. The queryKey is prefixed
 * with `/api/announcements` so the broad list invalidations in
 * AppStateContext (which invalidate `getListAnnouncementsQueryKey()`) refresh
 * these queries after any mutation.
 */
export function useScopedAnnouncements(params: Omit<ListAnnouncementsParams, 'page' | 'pageSize'> = {}) {
  const query = useQuery({
    queryKey: ['/api/announcements', 'scoped-all', params],
    queryFn: () =>
      fetchAllPages<ApiAnnouncement>(async (page, pageSize) => {
        const res = await listAnnouncements({ ...params, page, pageSize });
        return { items: res.announcements, total: res.total };
      }),
    staleTime: 30_000,
  });

  const announcements: Announcement[] = useMemo(
    () => (query.data?.items ?? []).map(apiToLocal),
    [query.data],
  );

  return {
    announcements,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
