import type { WorkflowStatus } from './mockData';

/**
 * Single source of truth for grouping workflow statuses into the four
 * dashboard KPI buckets.
 *
 * Dashboard KPI counts, the announcements list filter (AnnouncementsPage),
 * and the server stats endpoint must all use this same mapping so a KPI
 * count always equals the number of records shown when the KPI is clicked.
 * Every WorkflowStatus must appear in exactly one group.
 *
 * NOTE: this module deliberately uses a type-only import of WorkflowStatus so
 * it has no runtime dependency on mockData, keeping the import graph acyclic.
 */
export type StatusGroupKey = 'completed' | 'inReview' | 'inProgress' | 'notStarted';

export const statusGroups: Record<StatusGroupKey, WorkflowStatus[]> = {
  completed: ['completed'],
  inReview: ['pending_cmo_review', 'pending_completion_review', 'pending_cmo_completion_review', 'pending_dept_acceptance'],
  inProgress: ['in_progress', 'accepted'],
  notStarted: ['draft', 'reverted_by_cmo', 'pending_cmo_reconsideration', 'published', 'reverted_by_dept_reviewer', 'dropped', 'on_hold'],
};

const statusToGroup: Record<WorkflowStatus, StatusGroupKey> = (Object.keys(statusGroups) as StatusGroupKey[]).reduce(
  (acc, group) => {
    for (const status of statusGroups[group]) acc[status] = group;
    return acc;
  },
  {} as Record<WorkflowStatus, StatusGroupKey>,
);

export function classifyWorkflowStatus(status: WorkflowStatus): StatusGroupKey {
  return statusToGroup[status] ?? 'notStarted';
}
