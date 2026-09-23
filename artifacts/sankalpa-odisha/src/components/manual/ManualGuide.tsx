// ─── ManualGuide — full-screen visual user manual shell ──────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTIONS } from './sections';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManualGuide({ isOpen, onClose }: Props) {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // Escape to close; trap Tab focus inside the dialog; lock body scroll.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && shellRef.current) {
        const focusable = shellRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;
        if (!shellRef.current.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  // Focus management: move focus into the dialog on open, restore it on close.
  useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      lastFocusRef.current?.focus?.();
    }
  }, [isOpen]);

  // Reset to top of the content pane whenever the section changes.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setNavOpen(false);
  }, [activeId]);

  // Grouped nav structure, preserving section order — filtered by the search box.
  const navGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: string[] = [];
    const map = new Map<string, typeof SECTIONS>();
    for (const s of SECTIONS) {
      if (q && !s.label.toLowerCase().includes(q) && !s.group.toLowerCase().includes(q)) continue;
      if (!map.has(s.group)) {
        map.set(s.group, []);
        order.push(s.group);
      }
      map.get(s.group)!.push(s);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [query]);

  // Open the standalone, print-ready manual in a new tab and auto-run the
  // requested download (PDF via the browser print pipeline, or a self-contained
  // HTML file). Uses the artifact base path so routing works when deployed.
  const openExport = (action: 'pdf' | 'html') => {
    window.open(`${import.meta.env.BASE_URL}manual/export?action=${action}`, '_blank', 'noopener');
  };

  if (!isOpen) return null;

  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const activeIndex = SECTIONS.findIndex((s) => s.id === active.id);
  const prevSection = activeIndex > 0 ? SECTIONS[activeIndex - 1] : null;
  const nextSection = activeIndex < SECTIONS.length - 1 ? SECTIONS[activeIndex + 1] : null;

  return (
    <div className="manual-overlay" role="dialog" aria-modal="true" aria-label="User manual">
      <div className="manual-shell" ref={shellRef}>
        {/* Top bar */}
        <header className="manual-topbar">
          <button
            className="manual-nav-toggle"
            aria-label="Toggle sections"
            onClick={() => setNavOpen((v) => !v)}
          >
            <i className="bi bi-list" />
          </button>
          <div className="manual-brand">
            <i className="bi bi-book manual-brand-icon" />
            <div>
              <div className="manual-brand-title">User Manual</div>
              <div className="manual-brand-sub">Sankalpa Odisha — roles, workflow & rules</div>
            </div>
          </div>
          <div className="manual-topbar-actions">
            <button
              type="button"
              className="manual-dl-btn"
              onClick={() => openExport('pdf')}
              title="Download the full manual as a PDF"
            >
              <i className="bi bi-file-earmark-pdf" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              className="manual-dl-btn"
              onClick={() => openExport('html')}
              title="Download the full manual as a self-contained HTML file"
            >
              <i className="bi bi-filetype-html" />
              <span>Download HTML</span>
            </button>
          </div>
          <button ref={closeRef} className="manual-close" aria-label="Close manual" onClick={onClose}>
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <div className="manual-body">
          {/* Left nav */}
          <nav className={`manual-nav ${navOpen ? 'open' : ''}`}>
            <div className="manual-search">
              <i className="bi bi-search" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sections…"
                aria-label="Search manual sections"
              />
            </div>
            {navGroups.length === 0 && (
              <div className="manual-nav-empty">No sections match “{query}”.</div>
            )}
            {navGroups.map((g) => (
              <div key={g.group} className="manual-nav-group">
                <div className="manual-nav-grouplabel">{g.group}</div>
                {g.items.map((s) => (
                  <button
                    key={s.id}
                    className={`manual-nav-item ${s.id === activeId ? 'active' : ''}`}
                    onClick={() => setActiveId(s.id)}
                  >
                    <i className={`bi ${s.icon}`} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content */}
          <main className="manual-content" ref={contentRef}>
            <div className="manual-content-inner">
              <active.Component />
              <div className="manual-pager">
                {prevSection ? (
                  <button className="manual-pager-btn" onClick={() => setActiveId(prevSection.id)}>
                    <i className="bi bi-arrow-left" />
                    <span>
                      <small>Previous</small>
                      {prevSection.label}
                    </span>
                  </button>
                ) : <span />}
                {nextSection ? (
                  <button className="manual-pager-btn next" onClick={() => setActiveId(nextSection.id)}>
                    <span>
                      <small>Next</small>
                      {nextSection.label}
                    </span>
                    <i className="bi bi-arrow-right" />
                  </button>
                ) : <span />}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
