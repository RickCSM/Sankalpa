/** Shared operation registry. Finish handles are idempotent and concurrency-safe. */
export type LoadingKind = 'read' | 'write' | 'navigation' | 'background' | 'task';
type Operation = { kind: LoadingKind; message: string };
export type LoadingNotice = { id: number; message: string; error: boolean; retry?: () => void };
const operations = new Map<number, Operation>();
const listeners = new Set<() => void>();
let sequence = 0;
let notice: LoadingNotice | null = null;
function snapshot() {
  const entries = [...operations.values()];
  const blocking = entries.some(entry => entry.kind === 'write' || entry.kind === 'task');
  const foreground = entries.filter(entry => entry.kind !== 'background');
  return {
    count: entries.length, foreground: foreground.length, blocking,
    immediate: entries.some(entry => entry.kind === 'task'),
    message: (entries.find(entry => entry.kind === 'task' || entry.kind === 'write') ?? foreground.at(-1))?.message ?? 'Refreshing information…',
    notice,
  };
}
let state = snapshot();
function publish() { state = snapshot(); listeners.forEach(listener => listener()); }
export const loadingStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
export function beginLoading(kind: LoadingKind, message = kind === 'write' ? 'Processing your request…' : 'Loading, please wait…') {
  const id = ++sequence;
  operations.set(id, { kind, message });
  publish();
  return () => { if (operations.delete(id)) publish(); };
}
export function showLoadingNotice(message: string, error = false, retry?: () => void) {
  notice = { id: ++sequence, message, error, retry };
  publish();
}
export function dismissLoadingNotice(id: number) {
  if (notice?.id === id) { notice = null; publish(); }
}
export async function withLoading<T>(work: () => Promise<T>, message = 'Processing your request…'): Promise<T> {
  const finish = beginLoading('task', message);
  try {
    // Give the indicator a paint opportunity before CPU-heavy exports.
    await new Promise(resolve => setTimeout(resolve, 32));
    return await work();
  } finally { finish(); }
}

type FetchHost = { fetch: typeof fetch; location: { href: string } };
/** Installed once at startup: covers generated clients, raw API calls and uploads. */
export function installLoadingFetch(host: FetchHost, isBackground: (url: URL) => boolean = () => false) {
  const original = host.fetch;
  const tracked: typeof fetch = async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input), host.location.href);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const api = url.origin === new URL(host.location.href).origin && /\/api(?:\/|$)/.test(url.pathname);
    const upload = method === 'PUT';
    if (!api && !upload) return original.call(host, input, init);
    const reading = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    const background = reading && (/\/notifications(?:\/|$)/.test(url.pathname) || isBackground(url));
    const finish = beginLoading(reading ? background ? 'background' : 'read' : 'write');
    const controller = new AbortController();
    const source = init?.signal ?? request?.signal;
    const abort = () => controller.abort(source?.reason);
    if (source?.aborted) abort();
    else source?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(
      'The request timed out. Check whether it completed before retrying.', 'TimeoutError',
    )), upload ? 300_000 : reading ? 90_000 : 180_000);
    try {
      return await original.call(host, input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.reason?.name === 'TimeoutError') {
        showLoadingNotice('The request timed out. Check whether it completed before retrying.', true);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      source?.removeEventListener('abort', abort);
      finish();
    }
  };
  host.fetch = tracked;
  return () => { if (host.fetch === tracked) host.fetch = original; };
}
