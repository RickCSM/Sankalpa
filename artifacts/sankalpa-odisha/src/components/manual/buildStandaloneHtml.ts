// ─── Self-contained HTML builder for the downloadable User Manual ────────────
// Turns the rendered export document into a single .html file that works fully
// offline: every screenshot and clip is inlined as a data URI, the Bootstrap
// Icons web font is inlined, and CSS animations (walkthrough spotlights,
// looping muted clips) are preserved so the saved file keeps its micro-motion.

const ICON_CSS_URL =
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';

/** Minimal stylesheet the standalone file needs — most styling is inline. */
const EXPORT_CSS = `
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{background:#eef2f7;color:#374151;line-height:1.5;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
img,video,svg{max-width:100%;}
table{width:100%;border-collapse:collapse;}
ul{margin:0;}
.manual-export-doc{max-width:1080px;margin:0 auto;padding:36px 40px 64px;background:#fff;}
.manual-export-cover{text-align:center;padding:36px 0 44px;border-bottom:2px solid #e5e7eb;margin-bottom:32px;}
.manual-export-cover .crest{font-size:44px;color:#2c5282;margin-bottom:10px;}
.manual-export-cover h1{font-size:34px;font-weight:800;color:#0f2747;margin:0 0 8px;line-height:1.15;}
.manual-export-cover .sub{font-size:15px;color:#475569;margin:0 0 4px;}
.manual-export-cover .meta{font-size:12.5px;color:#94a3b8;margin-top:14px;}
.manual-export-toc{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:36px;}
.manual-export-toc h2{font-size:13px;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;margin:0 0 14px;}
.manual-export-toc-group{margin-bottom:12px;}
.manual-export-toc-grouplabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#2c5282;margin-bottom:6px;}
.manual-export-toc ol{margin:0;padding-left:20px;font-size:13.5px;line-height:1.9;}
.manual-export-toc a{color:#1d4ed8;text-decoration:none;}
.manual-export-toc a:hover{text-decoration:underline;}
.manual-export-section{margin-bottom:44px;scroll-margin-top:20px;}
.manual-export-section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#94a3b8;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
.manual-stack{display:flex;flex-direction:column;gap:18px;}
.manual-sec-head{margin-bottom:2px;}
.manual-kicker{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:#2c5282;margin-bottom:4px;}
.manual-h2{font-size:26px;font-weight:800;color:#0f2747;margin:0 0 8px;line-height:1.15;}
.manual-lead{font-size:14.5px;line-height:1.6;color:#475569;margin:0;max-width:760px;}
.manual-walk-frame{position:relative;overflow:hidden;}
.manual-walk-highlight{position:absolute;border:2.5px solid #f59e0b;border-radius:6px;pointer-events:none;
  box-shadow:0 0 0 9999px rgba(15,23,42,0.14),0 0 14px rgba(245,158,11,0.55);
  animation:manualSpotlight 1.7s ease-in-out infinite;}
@keyframes manualSpotlight{
  0%,100%{box-shadow:0 0 0 9999px rgba(15,23,42,0.16),0 0 0 0 rgba(245,158,11,0.5);}
  50%{box-shadow:0 0 0 9999px rgba(15,23,42,0.06),0 0 0 6px rgba(245,158,11,0.16);}}
@media print{
  body{background:#fff;}
  .manual-export-doc{max-width:none;margin:0;padding:0;}
  .manual-export-section{break-before:page;page-break-before:always;}
  .manual-export-cover,.manual-export-toc{break-after:page;page-break-after:always;}
  figure,table,.manual-walk-frame{break-inside:avoid;}
  @page{margin:14mm;}
}
@media (max-width:720px){
  .manual-export-walkstep{grid-template-columns:1fr !important;}
}
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * Fetch a CSS stylesheet and inline every url() font reference as a data URI so
 * the resulting CSS carries its fonts with no network dependency. Used for both
 * the Bootstrap Icons sheet and the Inter web font sheet.
 */
async function inlineFontCss(cssUrl: string): Promise<string> {
  const css = await (await fetch(cssUrl)).text();
  const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
  const resolved = new Map<string, string>();
  const seen: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(css)) !== null) {
    const raw = m[2];
    if (raw.startsWith('data:') || seen.includes(raw)) continue;
    seen.push(raw);
  }
  await Promise.all(
    seen.map(async (raw) => {
      const abs = new URL(raw, cssUrl).href;
      try {
        resolved.set(raw, await fetchAsDataUri(abs));
      } catch {
        resolved.set(raw, abs); // keep absolute URL as an online fallback
      }
    })
  );
  return css.replace(urlRe, (full, _q, raw) =>
    resolved.has(raw) ? `url("${resolved.get(raw)}")` : full
  );
}

/** Replace every <img>/<video> src in the clone with an inlined data URI. */
async function inlineMedia(root: HTMLElement): Promise<void> {
  const cache = new Map<string, Promise<string>>();
  const get = (url: string) => {
    if (!cache.has(url)) cache.set(url, fetchAsDataUri(url));
    return cache.get(url)!;
  };

  const imgs = Array.from(root.querySelectorAll('img'));
  const vids = Array.from(root.querySelectorAll('video'));

  await Promise.all([
    ...imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith('data:')) return;
      try {
        img.setAttribute('src', await get(src));
        img.removeAttribute('loading');
        img.removeAttribute('srcset');
      } catch {
        /* leave the original src if inlining fails */
      }
    }),
    ...vids.map(async (v) => {
      const src = v.getAttribute('src') || v.currentSrc;
      if (!src || src.startsWith('data:')) return;
      try {
        v.setAttribute('src', await get(src));
        v.setAttribute('autoplay', '');
        v.setAttribute('loop', '');
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.removeAttribute('poster');
      } catch {
        /* leave the original src if inlining fails */
      }
    }),
  ]);
}

/**
 * Build a fully self-contained HTML document from the live export container.
 * @param contentEl the `.manual-export-doc` element to serialise.
 * @param title document title.
 */
export async function buildStandaloneHtml(
  contentEl: HTMLElement,
  title: string
): Promise<string> {
  const clone = contentEl.cloneNode(true) as HTMLElement;

  const [, iconCss, fontCss] = await Promise.all([
    inlineMedia(clone),
    inlineFontCss(ICON_CSS_URL).catch(() => `@import url("${ICON_CSS_URL}");`),
    inlineFontCss(FONT_CSS_URL).catch(() => `@import url("${FONT_CSS_URL}");`),
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${fontCss}</style>
<style>${iconCss}</style>
<style>${EXPORT_CSS}</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;
}
