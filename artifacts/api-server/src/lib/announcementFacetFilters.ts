import { eq, sql, type SQL } from 'drizzle-orm';
import { announcementsTable } from '@workspace/db';

/** Exact, parameterized facets applied before both counting and pagination. */
export function announcementFacetFilters(query: { occasion?: unknown; tag?: unknown }): SQL[] {
  const filters: SQL[] = [];
  const occasion = typeof query.occasion === 'string' ? query.occasion.trim() : '';
  const tag = typeof query.tag === 'string' ? query.tag.trim() : '';
  if (occasion) filters.push(eq(announcementsTable.occasion, occasion));
  if (tag) filters.push(sql`${tag} = ANY(${announcementsTable.tags})`);
  return filters;
}
