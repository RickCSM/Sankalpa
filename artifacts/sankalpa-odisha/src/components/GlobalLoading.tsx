import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { beginLoading, dismissLoadingNotice, loadingStore } from '@/lib/loading';
import { useLocation } from 'wouter';
import './GlobalLoading.css';

/** Observes routing without touching history, preserving the Back/logout guard. */
export function NavigationLoading() {
  const [location] = useLocation();
  useEffect(() => {
    const finish = beginLoading('navigation', 'Loading page…');
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(finish); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); finish(); };
  }, [location]);
  return null;
}

export default function GlobalLoading({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(loadingStore.subscribe, loadingStore.getSnapshot);
  const active = state.count > 0;
  const [visible, setVisible] = useState(false);
  const [portalHost, setPortalHost] = useState<Element>(document.body);
  useEffect(() => {
    if (!active) { setVisible(false); return; }
    if (state.immediate) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [active, state.immediate]);

  useEffect(() => {
    const findHost = () => {
      // A normal z-index cannot cover native dialogs in the browser top layer.
      const dialogs = document.querySelectorAll('dialog[open]');
      setPortalHost(dialogs.item(dialogs.length - 1) ?? document.body);
    };
    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('app-working', active);
    document.documentElement.classList.toggle('app-saving', state.blocking);
    return () => { document.documentElement.classList.remove('app-working', 'app-saving'); };
  }, [active, state.blocking]);

  useEffect(() => {
    // Read the live store, not render state: block the second action even in the
    // same frame as the first request, including clicks inside native dialogs.
    const guard = (event: Event) => {
      if (!loadingStore.getSnapshot().blocking) return;
      const target = event.target instanceof Element ? event.target : null;
      // Export libraries dispatch synthetic download clicks while building.
      if (!event.isTrusted && target?.closest('a[download]')) return;
      if (event.type === 'submit' || target?.closest('button, input[type=submit], input[type=button], a[href]')) {
        if (target?.closest('[data-loading-control]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('click', guard, true);
    window.addEventListener('submit', guard, true);
    return () => { window.removeEventListener('click', guard, true); window.removeEventListener('submit', guard, true); };
  }, []);

  useEffect(() => {
    if (!state.notice || state.notice.error) return;
    const id = state.notice.id;
    const timer = setTimeout(() => dismissLoadingNotice(id), 5000);
    return () => clearTimeout(timer);
  }, [state.notice]);

  return <>
    {/* Native disabled inheritance preserves each control's own validation state. */}
    <fieldset className="app-loading-boundary" disabled={state.blocking} aria-busy={active}>
      {children}
    </fieldset>
    {createPortal(<>
      {visible && active && <div className={`app-loading-layer ${state.blocking ? 'is-blocking' : ''} ${state.foreground ? '' : 'is-background'}`}>
        <div className="app-loading-status" role="status" aria-live="polite" aria-atomic="true">
          <span className="app-loading-spinner" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      </div>}
      {state.notice && <div className={`app-operation-notice ${state.notice.error ? 'is-error' : ''}`}
        role={state.notice.error ? 'alert' : 'status'} aria-atomic="true">
        <span>{state.notice.message}</span>
        {state.notice.retry && <button type="button" data-loading-control disabled={state.blocking}
          onClick={() => { const current = state.notice; if (current) { dismissLoadingNotice(current.id); current.retry?.(); } }}>Retry</button>}
        <button type="button" data-loading-control aria-label="Dismiss message" onClick={() => dismissLoadingNotice(state.notice!.id)}>×</button>
      </div>}
    </>, portalHost)}
  </>;
}
