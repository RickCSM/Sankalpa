/** CM-only presentation change; other roles retain their existing report view. */
export function locationReportPresentation(role?: string) {
  const isCm = role === 'chief_minister';
  return {
    title: isCm ? 'District Wise Report' : 'Location-wise Report',
    menuLabel: isCm ? 'District Wise Report' : 'Location Wise Report',
    breadcrumbLabel: isCm ? 'District Wise' : 'Location Wise',
    paginate: !isCm,
  };
}
