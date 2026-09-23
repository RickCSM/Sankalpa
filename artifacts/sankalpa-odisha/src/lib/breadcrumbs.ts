export interface Crumb {
  label: string;
  path?: string;
}

const REPORT_GROUP = [
  '/reports/location-wise',
  '/reports/department-wise',
  '/reports/announcement-progress',
  '/reports/occasion-wise',
  '/reports/aging-analysis',
];

const MASTERS_GROUP = [
  '/masters/districts',
  '/masters/blocks',
  '/masters/occasions',
  '/masters/departments',
  '/masters/categories',
  '/masters/tags',
];

const REPORT_LABELS: Record<string, string> = {
  '/reports/location-wise': 'Location Wise',
  '/reports/department-wise': 'Department Wise',
  '/reports/announcement-progress': 'Announcement & Progress',
  '/reports/occasion-wise': 'Occasion Wise',
  '/reports/aging-analysis': 'Sankalpa Patra Ageing Analysis Report',
  '/reports/uoi-notes': 'UOI Notes',
};

function titleize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const HOME: Crumb = { label: 'Dashboard', path: '/' };

export function buildBreadcrumbs(path: string): Crumb[] {
  if (path === '/' || path === '') return [{ label: 'Dashboard' }];

  if (path === '/announcements') return [HOME, { label: 'HCM Announcements' }];
  if (path === '/announcements/add') return [HOME, { label: 'HCM Announcements', path: '/announcements' }, { label: 'New Announcement' }];
  if (/^\/announcements\/[^/]+\/edit$/.test(path)) return [HOME, { label: 'HCM Announcements', path: '/announcements' }, { label: 'Edit Announcement' }];
  if (/^\/announcements\/[^/]+$/.test(path)) return [HOME, { label: 'HCM Announcements', path: '/announcements' }, { label: 'Announcement Details' }];

  if (path === '/users') return [HOME, { label: 'Manage Users' }];
  if (path === '/user-tagging') return [HOME, { label: 'User Tagging' }];
  if (path === '/activity-log') return [HOME, { label: 'Activity Log' }];

  if (path === '/reports/department-wise') return [HOME, { label: 'Reports' }, { label: 'Department Wise' }];
  const deptDetail = path.match(/^\/reports\/department-wise\/(.+)$/);
  if (deptDetail) return [HOME, { label: 'Reports' }, { label: 'Department Wise', path: '/reports/department-wise' }, { label: decodeURIComponent(deptDetail[1]) }];
  if (REPORT_LABELS[path]) return [HOME, { label: 'Reports' }, { label: REPORT_LABELS[path] }];

  const masters = path.match(/^\/masters\/([^/]+)$/);
  if (masters) return [HOME, { label: 'Masters' }, { label: titleize(masters[1]) }];

  if (path === '/my-actions') return [HOME, { label: 'My Actions' }];
  if (path === '/uoi-notes') return [HOME, { label: 'UOI Notes' }];
  if (path === '/profile') return [HOME, { label: 'My Profile' }];
  if (path === '/change-password') return [HOME, { label: 'Change Password' }];
  if (path === '/flushusers') return [HOME, { label: 'Factory Reset' }];

  return [HOME];
}

export function sequenceLabel(path: string): string | undefined {
  if (REPORT_LABELS[path]) return REPORT_LABELS[path];
  const m = path.match(/^\/masters\/([^/]+)$/);
  return m ? titleize(m[1]) : undefined;
}

/**
 * For pages that belong to a fixed, route-derived ordered set (the Reports
 * pages and the Masters tabs), return the sibling routes so the page can offer
 * Prev/Next. Pages with no natural sequence return an empty object.
 */
export function getSequence(path: string): { prev?: string; next?: string } {
  for (const group of [REPORT_GROUP, MASTERS_GROUP]) {
    const idx = group.indexOf(path);
    if (idx !== -1) {
      return {
        prev: idx > 0 ? group[idx - 1] : undefined,
        next: idx < group.length - 1 ? group[idx + 1] : undefined,
      };
    }
  }
  return {};
}
