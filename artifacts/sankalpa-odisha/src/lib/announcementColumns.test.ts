import { describe, expect, it } from 'vitest';
import type { Announcement } from '@workspace/api-client-react';
import { ANNOUNCEMENT_COLUMNS, formatAnnouncementColumn } from './announcementColumns';

const record = {
  id: 1, uniqueId: 'TEST', title: 'Example', date: '2026-10-16',
  description: 'Water supply improvements', department: 'Test Department', occasion: 'Visit',
  location: 'Test Location', district: 'Test District', block: 'Test Block',
  category: 'Other', otherCategory: 'Local works', tags: ['Water', 'Infrastructure'],
  workflowStatus: 'in_progress', createdBy: 9, createdAt: new Date(),
} satisfies Announcement;
const users = new Map([[9, 'Test Creator']]);

describe('HCM announcement columns', () => {
  it('includes all missing announcement form fields without changing defaults', () => {
    const keys = ANNOUNCEMENT_COLUMNS.map(column => column.key);
    expect(keys).toEqual(expect.arrayContaining(['description', 'block', 'otherCategory', 'tags']));
    expect(new Set(keys).size).toBe(keys.length);
    expect(ANNOUNCEMENT_COLUMNS.filter(column => column.defaultOn).map(column => column.key))
      .toEqual(['uniqueId', 'title', 'date', 'department', 'occasion', 'location', 'currentlyWith', 'workflowStatus']);
    expect(ANNOUNCEMENT_COLUMNS.find(column => column.key === 'tags')?.label).toBe('Relevant Tags');
    expect(ANNOUNCEMENT_COLUMNS.find(column => column.key === 'date')?.label).toBe('Announcement Date');
  });
  it('formats new columns consistently for the table and export', () => {
    expect(formatAnnouncementColumn(record, 'tags', users)).toBe('Water, Infrastructure');
    expect(formatAnnouncementColumn(record, 'description', users)).toBe('Water supply improvements');
    expect(formatAnnouncementColumn(record, 'block', users)).toBe('Test Block');
    expect(formatAnnouncementColumn(record, 'otherCategory', users)).toBe('Local works');
  });
  it('handles empty optional fields and blank tags', () => {
    const empty = { ...record, block: null, otherCategory: '', description: '', tags: ['  ', ''] };
    for (const key of ['block', 'otherCategory', 'description', 'tags'] as const) {
      expect(formatAnnouncementColumn(empty, key, users)).toBe('—');
    }
    expect(formatAnnouncementColumn({ ...record, tags: [] }, 'tags', users)).toBe('—');
  });
  it('retains existing creator, status and text formatting', () => {
    expect(formatAnnouncementColumn(record, 'createdBy', users)).toBe('Test Creator');
    expect(formatAnnouncementColumn(record, 'createdBy', new Map())).toBe('—');
    expect(formatAnnouncementColumn(record, 'workflowStatus', users)).toBe('In Progress');
    expect(formatAnnouncementColumn(record, 'title', users)).toBe('Example');
    expect(formatAnnouncementColumn(record, 'date', users)).not.toBe('—');
  });
  it('shows Currently With by default and formats the server value identically for all viewers and exports', () => {
    expect(ANNOUNCEMENT_COLUMNS.find(column => column.key === 'currentlyWith'))
      .toEqual({ key: 'currentlyWith', label: 'Currently With', defaultOn: true });
    const pending = { ...record, currentlyWith: 'Reviewer A — Director\nReviewer B — Secretary' };
    expect(formatAnnouncementColumn(pending, 'currentlyWith', new Map())).toBe(pending.currentlyWith);
    expect(formatAnnouncementColumn(pending, 'currentlyWith', users)).toBe(pending.currentlyWith);
  });
  it('supports non-pending status text and older API responses without pending-approver data', () => {
    for (const label of ['Approved', 'Completed', 'Returned for correction', 'On hold', '—']) {
      expect(formatAnnouncementColumn({ ...record, currentlyWith: label }, 'currentlyWith', users)).toBe(label);
    }
    expect(formatAnnouncementColumn(record, 'currentlyWith', users)).toBe('—');
    expect(formatAnnouncementColumn({ ...record, currentlyWith: '' }, 'currentlyWith', users)).toBe('—');
  });
});
