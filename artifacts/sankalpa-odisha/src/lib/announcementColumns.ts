import type { Announcement } from '@workspace/api-client-react';
import { formatDate, workflowStatusLabels, type WorkflowStatus } from '../data/mockData';

/** Shared by the column picker, table cells and Excel export. */
export const ANNOUNCEMENT_COLUMNS = [
  { key: 'uniqueId', label: 'Unique ID', defaultOn: true },
  { key: 'title', label: 'Title', defaultOn: true },
  { key: 'date', label: 'Announcement Date', defaultOn: true },
  { key: 'description', label: 'Description', defaultOn: false },
  { key: 'department', label: 'Department', defaultOn: true },
  { key: 'occasion', label: 'Occasion', defaultOn: true },
  { key: 'location', label: 'Location', defaultOn: true },
  { key: 'district', label: 'District', defaultOn: false },
  { key: 'block', label: 'Block', defaultOn: false },
  { key: 'category', label: 'Category', defaultOn: false },
  { key: 'otherCategory', label: 'Other Category', defaultOn: false },
  { key: 'tags', label: 'Relevant Tags', defaultOn: false },
  { key: 'createdBy', label: 'Created By', defaultOn: false },
  { key: 'currentlyWith', label: 'Currently With', defaultOn: true },
  { key: 'workflowStatus', label: 'Status', defaultOn: true },
] as const;

export type AnnouncementColumnKey = typeof ANNOUNCEMENT_COLUMNS[number]['key'];

export function formatAnnouncementColumn(
  announcement: Announcement, key: AnnouncementColumnKey, users: ReadonlyMap<number, string>,
): string {
  if (key === 'date') return announcement.date ? formatDate(announcement.date) : '—';
  if (key === 'tags') return announcement.tags?.filter(tag => tag.trim()).join(', ') || '—';
  if (key === 'createdBy') return users.get(announcement.createdBy) || '—';
  if (key === 'workflowStatus') return workflowStatusLabels[announcement.workflowStatus as WorkflowStatus] || announcement.workflowStatus || '—';
  return announcement[key] || '—';
}
