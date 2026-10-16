import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginLoading, dismissLoadingNotice, installLoadingFetch, loadingStore, showLoadingNotice, withLoading } from './loading';

afterEach(() => { vi.useRealTimers(); const notice = loadingStore.getSnapshot().notice; if (notice) dismissLoadingNotice(notice.id); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function host(fetcher: typeof fetch) { return { fetch: fetcher, location: { href: 'https://example.test/app/' } }; }
const response = () => new Response('{}', { headers: { 'Content-Type': 'application/json' } });

describe('shared loading registry', () => {
  it('keeps concurrent work visible and finish handles idempotent', () => {
    const read = beginLoading('read');
    const write = beginLoading('write');
    expect(loadingStore.getSnapshot()).toMatchObject({ count: 2, blocking: true });
    read(); read();
    expect(loadingStore.getSnapshot().count).toBe(1);
    write();
    expect(loadingStore.getSnapshot()).toMatchObject({ count: 0, blocking: false });
  });
  it('notifies subscribers and lets newer messages replace old ones safely', () => {
    const listener = vi.fn();
    const unsubscribe = loadingStore.subscribe(listener);
    showLoadingNotice('Saved');
    const first = loadingStore.getSnapshot().notice!.id;
    showLoadingNotice('Failed', true);
    dismissLoadingNotice(first);
    expect(loadingStore.getSnapshot().notice?.message).toBe('Failed');
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('cleans up failed local processing and allows retry', async () => {
    vi.useFakeTimers();
    const operation = withLoading(async () => { throw new Error('Export failed'); });
    const result = expect(operation).rejects.toThrow('Export failed');
    expect(loadingStore.getSnapshot().blocking).toBe(true);
    await vi.advanceTimersByTimeAsync(32);
    await result;
    expect(loadingStore.getSnapshot().count).toBe(0);
    const retry = withLoading(async () => 'done');
    await vi.advanceTimersByTimeAsync(32);
    expect(await retry).toBe('done');
    expect(loadingStore.getSnapshot().count).toBe(0);
  });
});

describe('central fetch tracking', () => {
  it('tracks relative API writes, preserving input and cleanup on success', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>(() => pending.promise);
    const target = host(fetcher);
    const restore = installLoadingFetch(target);
    const init = { method: 'POST', credentials: 'include' as const, body: '{"comment":"hello"}' };
    const promise = target.fetch('/api/announcements/1/review-completion', init);
    expect(loadingStore.getSnapshot().blocking).toBe(true);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject(init);
    pending.resolve(response());
    await promise;
    expect(loadingStore.getSnapshot().count).toBe(0);
    restore();
    expect(target.fetch).toBe(fetcher);
  });
  it('waits for all concurrent requests and clears rejected work', async () => {
    const first = deferred<Response>(), second = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const target = host(fetcher);
    const restore = installLoadingFetch(target);
    const a = target.fetch('/api/users'), b = target.fetch('/api/departments');
    const failed = expect(b).rejects.toThrow('Offline');
    first.resolve(response()); await a;
    expect(loadingStore.getSnapshot().count).toBe(1);
    second.reject(new Error('Offline')); await failed;
    expect(loadingStore.getSnapshot().count).toBe(0);
    restore();
  });
  it('ignores static assets but covers direct-to-storage uploads', async () => {
    const pending = deferred<Response>();
    const target = host(vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockImplementationOnce(() => pending.promise));
    const restore = installLoadingFetch(target);
    await target.fetch('/fonts/example.ttf');
    expect(loadingStore.getSnapshot().count).toBe(0);
    const upload = target.fetch('https://storage.example.test/upload', { method: 'PUT', body: 'file' });
    expect(loadingStore.getSnapshot().blocking).toBe(true);
    pending.resolve(response()); await upload;
    expect(loadingStore.getSnapshot().count).toBe(0);
    restore();
  });
  it('treats notification polling and cached refreshes as nonblocking background work', async () => {
    const pending = deferred<Response>();
    const target = host(() => pending.promise);
    const restore = installLoadingFetch(target, url => url.pathname === '/api/users');
    const a = target.fetch('/api/notifications?page=1'), b = target.fetch('/api/users');
    expect(loadingStore.getSnapshot()).toMatchObject({ foreground: 0, count: 2, blocking: false });
    pending.resolve(response()); await Promise.all([a, b]);
    restore();
  });
  it('preserves caller cancellation, including Request input', async () => {
    const source = new AbortController();
    const target = host(async (_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    }));
    const restore = installLoadingFetch(target);
    const promise = target.fetch(new Request('https://example.test/api/users', { method: 'POST', signal: source.signal }));
    const failed = expect(promise).rejects.toThrow('Cancelled');
    source.abort(new DOMException('Cancelled', 'AbortError'));
    await failed;
    expect(loadingStore.getSnapshot().count).toBe(0);
    restore();
  });
  it('clears timed-out requests and provides a useful warning', async () => {
    vi.useFakeTimers();
    const target = host(async (_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    }));
    const restore = installLoadingFetch(target);
    const promise = target.fetch('/api/users');
    const failed = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(90_000);
    await failed;
    expect(loadingStore.getSnapshot().count).toBe(0);
    expect(loadingStore.getSnapshot().notice?.message).toContain('Check whether it completed');
    restore();
  });
  it('cleans up HTTP error responses without swallowing the error status', async () => {
    const target = host(async () => new Response('Failed', { status: 500 }));
    const restore = installLoadingFetch(target);
    expect((await target.fetch('/api/users')).status).toBe(500);
    expect(loadingStore.getSnapshot().count).toBe(0);
    restore();
  });
});
