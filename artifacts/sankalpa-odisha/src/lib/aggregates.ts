import { useQuery } from '@tanstack/react-query';

/**
 * Client hooks for the server-side aggregate endpoints. These replace the old
 * "fetch the most recent 200 rows and count them on the client" approach so
 * every KPI and report count reflects the FULL dataset.
 *
 * draftMode mirrors the client helpers exactly:
 *  - 'own'     => filterVisibleAnnouncements (a creator still sees own drafts) — dashboard
 *  - 'exclude' => excludeDrafts (no drafts at all)                              — reports
 *  - 'all'     => no draft filter
 *
 * Raw fetch against '/api' (root-mounted) mirrors the existing deptStats query.
 */

export type AggGroupBy = 'none' | 'department' | 'district' | 'block' | 'occasion';
export type DraftMode = 'own' | 'exclude' | 'all';

export interface AggregateCounts {
  total: number;
  completed: number;
  inReview: number;
  inProgress: number;
  notStarted: number;
}
export interface AggregateBucket extends AggregateCounts {
  key: string;
}
export interface AggregateResponse {
  buckets: AggregateBucket[];
  overall: AggregateCounts;
}

export interface AggregateParams {
  groupBy?: AggGroupBy;
  draftMode?: DraftMode;
  status?: string;
  department?: string;
  district?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  createdBy?: number;
}

const EMPTY_COUNTS: AggregateCounts = { total: 0, completed: 0, inReview: 0, inProgress: 0, notStarted: 0 };

function toQuery(params: AggregateParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useAggregate(params: AggregateParams = {}, enabled = true) {
  const query = useQuery({
    queryKey: ['announcements-aggregate', params],
    queryFn: async () => {
      const res = await fetch(`/api/announcements/aggregate${toQuery(params)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch aggregate');
      return res.json() as Promise<AggregateResponse>;
    },
    enabled,
    staleTime: 30_000,
  });
  return {
    ...query,
    buckets: query.data?.buckets ?? [],
    overall: query.data?.overall ?? EMPTY_COUNTS,
  };
}

/** Convenience: bucket array -> { [key]: counts } map for keyed lookups. */
export function bucketsToRecord(buckets: AggregateBucket[]): Record<string, AggregateCounts> {
  const out: Record<string, AggregateCounts> = {};
  for (const b of buckets) {
    out[b.key] = {
      total: b.total,
      completed: b.completed,
      inReview: b.inReview,
      inProgress: b.inProgress,
      notStarted: b.notStarted,
    };
  }
  return out;
}

export interface AgingCounts {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  total: number;
}
export interface AgingBucket extends AgingCounts {
  key: string;
}
export interface AgingResponse {
  buckets: AgingBucket[];
  overall: AgingCounts;
}

const EMPTY_AGING: AgingCounts = { b0: 0, b1: 0, b2: 0, b3: 0, total: 0 };

export function useAgingAggregate(params: Omit<AggregateParams, 'groupBy'> = {}, enabled = true) {
  const query = useQuery({
    queryKey: ['announcements-aggregate-aging', params],
    queryFn: async () => {
      const res = await fetch(`/api/announcements/aggregate/aging${toQuery(params)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch aging aggregate');
      return res.json() as Promise<AgingResponse>;
    },
    enabled,
    staleTime: 30_000,
  });
  return {
    ...query,
    buckets: query.data?.buckets ?? [],
    overall: query.data?.overall ?? EMPTY_AGING,
  };
}
