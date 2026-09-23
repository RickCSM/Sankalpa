import { QueryCache, MutationCache, QueryClient } from "@tanstack/react-query";

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
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
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
