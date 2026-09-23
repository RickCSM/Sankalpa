/**
 * Fetch every page of a server-paginated list endpoint and return the full,
 * uncapped set of items plus the server-reported total.
 *
 * The list endpoints cap `pageSize` per request, so dashboards and reports
 * used to compute aggregates over only the most recent page — producing
 * counts that silently capped out and disagreed with the full list view.
 * Paging through to completion here is what gives those views accurate,
 * uncapped aggregates while still reusing the existing client-side compute
 * logic (the single source of truth for status grouping).
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  pageSize = 500,
): Promise<{ items: T[]; total: number }> {
  const first = await fetchPage(1, pageSize);
  const items = first.items.slice();
  const totalPages = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page, pageSize);
    items.push(...next.items);
  }
  return { items, total: first.total };
}
