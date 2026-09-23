// ─── Standalone, print-ready view of the whole User Manual ───────────────────
// Renders every manual section stacked on one page (cover + table of contents +
// all sections in export mode). Powers both downloads:
//   • Download PDF  → the browser's high-fidelity print pipeline (Save as PDF)
//   • Download HTML → a fully self-contained .html file (see buildStandaloneHtml)
// Opened in its own tab from the manual's top bar; `?action=pdf|html` triggers
// the matching download automatically once screenshots and fonts have loaded.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTIONS } from '@/components/manual/sections';
import { ManualExportContext } from '@/components/manual/ManualExportContext';
import { buildStandaloneHtml } from '@/components/manual/buildStandaloneHtml';

const DOC_TITLE = 'Sankalpa Odisha — User Manual';

/** Wait until screenshots and web fonts are ready so exports capture them. */
async function waitForAssets(root: HTMLElement | null): Promise<void> {
  if (!root) return;
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* fonts API unavailable — carry on */
  }
  const imgs = Array.from(root.querySelectorAll('img'));
  const vids = Array.from(root.querySelectorAll('video'));
  await Promise.all([
    ...imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    ),
    // Wait for each clip to have decoded a first frame (readyState >= 2),
    // capped so a stalled clip can never block the export indefinitely.
    ...vids.map(
      (v) =>
        new Promise<void>((resolve) => {
          if (v.readyState >= 2) return resolve();
          const done = () => resolve();
          v.addEventListener('loadeddata', done, { once: true });
          v.addEventListener('error', done, { once: true });
          setTimeout(done, 3000);
        })
    ),
  ]);
  // Small settle buffer so painted frames are captured cleanly.
  await new Promise((r) => setTimeout(r, 150));
}

export default function ManualExportPage() {
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'pdf' | 'html' | null>(null);
  const ranAuto = useRef(false);

  const tocGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, typeof SECTIONS>();
    for (const s of SECTIONS) {
      if (!map.has(s.group)) {
        map.set(s.group, []);
        order.push(s.group);
      }
      map.get(s.group)!.push(s);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, []);

  const generatedOn = useMemo(
    () =>
      new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const downloadPdf = async () => {
    setBusy('pdf');
    try {
      await waitForAssets(docRef.current);
      window.print();
    } finally {
      setBusy(null);
    }
  };

  const downloadHtml = async () => {
    if (!docRef.current) return;
    setBusy('html');
    try {
      await waitForAssets(docRef.current);
      const html = await buildStandaloneHtml(docRef.current, DOC_TITLE);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SankalpaOdisha-User-Manual.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(null);
    }
  };

  // Auto-run the requested download once, on load.
  useEffect(() => {
    if (ranAuto.current) return;
    ranAuto.current = true;
    const action = new URLSearchParams(window.location.search).get('action');
    if (action === 'pdf') void downloadPdf();
    else if (action === 'html') void downloadHtml();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ManualExportContext.Provider value={true}>
      <div className="manual-export-page">
        <div className="manual-export-toolbar">
          <div className="manual-export-title">
            <i className="bi bi-book" />
            <span>User Manual — download</span>
          </div>
          <button
            type="button"
            className="manual-export-btn"
            onClick={downloadPdf}
            disabled={busy !== null}
          >
            <i className="bi bi-file-earmark-pdf" />
            <span>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</span>
          </button>
          <button
            type="button"
            className="manual-export-btn"
            onClick={downloadHtml}
            disabled={busy !== null}
          >
            <i className="bi bi-filetype-html" />
            <span>{busy === 'html' ? 'Building…' : 'Download HTML'}</span>
          </button>
          <button
            type="button"
            className="manual-export-btn"
            onClick={() => window.close()}
          >
            <i className="bi bi-x-lg" />
            <span>Close</span>
          </button>
        </div>

        <div className="manual-export-doc" ref={docRef}>
          <header className="manual-export-cover">
            <div className="crest">
              <i className="bi bi-bookmark-star-fill" />
            </div>
            <h1>Sankalpa Odisha</h1>
            <p className="sub">User Manual — roles, workflow &amp; rules</p>
            <p className="sub">
              Tracking the Hon'ble Chief Minister's announcements from creation to
              closure
            </p>
            <p className="meta">Generated on {generatedOn}</p>
          </header>

          <nav className="manual-export-toc" aria-label="Table of contents">
            <h2>Contents</h2>
            {tocGroups.map((g) => (
              <div key={g.group} className="manual-export-toc-group">
                <div className="manual-export-toc-grouplabel">{g.group}</div>
                <ol>
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <a href={`#sec-${s.id}`}>{s.label}</a>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </nav>

          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={`sec-${s.id}`}
              className="manual-export-section"
            >
              <div className="manual-export-section-title">
                <i className={`bi ${s.icon}`} />
                <span>
                  {s.group} — {s.label}
                </span>
              </div>
              <s.Component />
            </section>
          ))}
        </div>
      </div>
    </ManualExportContext.Provider>
  );
}
