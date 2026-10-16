import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { installQueryLoading, queryClient } from "./lib/queryClient";
import "./index.css";
import GlobalLoading from "./components/GlobalLoading";
import { installLoadingFetch } from "./lib/loading";

const restoreFetch = installLoadingFetch(window, url => queryClient.getQueryCache().getAll().some(query =>
  query.state.fetchStatus === 'fetching' && query.state.data !== undefined &&
  (query.queryKey[0] === url.pathname ||
    (url.pathname.includes('/announcements/aggregate') && String(query.queryKey[0]).includes('aggregate'))),
));
const restoreQueryLoading = installQueryLoading();
if (import.meta.hot) import.meta.hot.dispose(() => { restoreFetch(); restoreQueryLoading(); });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <GlobalLoading><App /></GlobalLoading>
  </QueryClientProvider>,
);
