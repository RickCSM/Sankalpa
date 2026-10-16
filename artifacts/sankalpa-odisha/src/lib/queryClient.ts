import { QueryCache, MutationCache, QueryClient } from "@tanstack/react-query";
import { getFriendlyErrorMessage } from "./errorMessages";
import { beginLoading, showLoadingNotice } from "./loading";

/**
 * If any API call fails with HTTP 403 and the server's error code is
 * `PASSWORD_CHANGE_REQUIRED`, redirect the browser to /change-password.
 * This is the defensive fallback for the force-change-password flow
 * introduced in Task #114: route guards already cover normal navigation,
 * but a stale tab or background polling call could still race past them
 * before the auth context's `mustChangePassword` flag is refreshed.
 */
function handleApiError(error: unknown): void {
  if (typeof window === "undefined") return;
  const err = error as { status?: number; data?: { error?: unknown } } | null;
  if (err?.status !== 403) return;
  const code = err.data?.error;
  if (code !== "PASSWORD_CHANGE_REQUIRED") return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const target = `${base}/change-password`;
  if (window.location.pathname !== target) {
    window.location.assign(target);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error, query) => {
    handleApiError(error);
    if ((error as { status?: number })?.status === 401) return;
    // Routine notification refresh failures should not interrupt the user.
    if (String(query.queryKey[0]).includes('/notifications')) return;
    showLoadingNotice(getFriendlyErrorMessage(error, 'Unable to load information. Please retry.'), true,
      () => { void queryClient.invalidateQueries({ queryKey: query.queryKey }); });
  } }),
  mutationCache: new MutationCache({
    onError: (error) => {
      handleApiError(error);
      showLoadingNotice(getFriendlyErrorMessage(error, 'Unable to complete the request. Please try again.'), true);
    },
    onSuccess: () => showLoadingNotice('Request completed successfully.'),
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: false,
    },
  },
});

/** Keep the UI busy through response parsing, chained mutation work and retries. */
export function installQueryLoading() {
  const pending = new Map<string, () => void>();
  const update = (id: string, active: boolean, kind: 'read' | 'write' | 'background') => {
    if (active && !pending.has(id)) pending.set(id, beginLoading(kind));
    if (!active) { pending.get(id)?.(); pending.delete(id); }
  };
  const queries = queryClient.getQueryCache().subscribe(event => {
    const query = event.query;
    update(`query:${query.queryHash}`, event.type !== 'removed' && query.state.fetchStatus === 'fetching',
      query.state.data === undefined ? 'read' : 'background');
  });
  const mutations = queryClient.getMutationCache().subscribe(event => {
    if (!event.mutation) return;
    const mutation = event.mutation;
    update(`mutation:${mutation.mutationId}`, event.type !== 'removed' && mutation.state.status === 'pending' && !mutation.state.isPaused, 'write');
  });
  return () => { queries(); mutations(); pending.forEach(finish => finish()); pending.clear(); };
}
