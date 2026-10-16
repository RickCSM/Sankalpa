import { describe, expect, it } from 'vitest';
import { locationReportPresentation } from './locationReportPresentation';
import { buildBreadcrumbs, sequenceLabel } from './breadcrumbs';
import { odishaDistricts } from '../data/mockData';

describe('CM-only district report presentation', () => {
  it('renames the report and disables row pagination only for CM', () => {
    expect(locationReportPresentation('chief_minister')).toEqual({
      title: 'District Wise Report', menuLabel: 'District Wise Report',
      breadcrumbLabel: 'District Wise', paginate: false,
    });
    expect(odishaDistricts).toHaveLength(30);
    expect(new Set(odishaDistricts).size).toBe(30);
  });
  it.each(['ocac_viewer', 'admin', 'cmo_reviewer', 'cmo_nodal', 'dept_nodal', 'dept_reviewer', 'dept_head', 'dept_user', 'chief_secretary', undefined])(
    'preserves the existing name and pagination for %s',
    role => expect(locationReportPresentation(role)).toEqual({
      title: 'Location-wise Report', menuLabel: 'Location Wise Report',
      breadcrumbLabel: 'Location Wise', paginate: true,
    }),
  );
  it('renames CM breadcrumbs and report sequence labels without changing links', () => {
    expect(buildBreadcrumbs('/reports/location-wise', 'chief_minister').at(-1)?.label).toBe('District Wise');
    expect(sequenceLabel('/reports/location-wise', 'chief_minister')).toBe('District Wise');
    expect(buildBreadcrumbs('/reports/location-wise', 'admin').at(-1)?.label).toBe('Location Wise');
    expect(sequenceLabel('/reports/location-wise')).toBe('Location Wise');
    expect(buildBreadcrumbs('/announcements', 'chief_minister').at(-1)?.label).toBe('HCM Announcements');
  });
});
