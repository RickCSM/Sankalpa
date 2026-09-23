import { useState, type CSSProperties } from 'react';

interface Props {
  onExcel: () => void | Promise<void>;
  onPdf: () => void | Promise<void>;
  disabled?: boolean;
}

export default function ReportDownloadButtons({ onExcel, onPdf, disabled }: Props) {
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unavailable = !!disabled || busy !== null;

  const runDownload = async (kind: 'excel' | 'pdf', download: () => void | Promise<void>) => {
    if (unavailable) return;
    setBusy(kind);
    setError(null);
    try {
      await download();
    } catch (caught) {
      const detail = caught instanceof Error && caught.message ? ` ${caught.message}` : '';
      setError(`Unable to download the ${kind === 'excel' ? 'Excel workbook' : 'PDF'}.${detail}`);
    } finally {
      setBusy(null);
    }
  };

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    border: '1px solid transparent',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: unavailable ? 'not-allowed' : 'pointer',
    opacity: unavailable ? 0.6 : 1,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={unavailable}
          aria-busy={busy === 'excel'}
          onClick={() => void runDownload('excel', onExcel)}
          style={{ ...baseStyle, background: '#16a34a', color: '#fff', borderColor: '#15803d' }}
          title="Download as Excel (.xlsx)"
        >
          <i className={`bi ${busy === 'excel' ? 'bi-arrow-repeat' : 'bi-file-earmark-spreadsheet'}`} style={{ fontSize: 14 }}></i>
          {busy === 'excel' ? 'Preparing Excel…' : 'Download Excel'}
        </button>
        <button
          type="button"
          disabled={unavailable}
          aria-busy={busy === 'pdf'}
          onClick={() => void runDownload('pdf', onPdf)}
          style={{ ...baseStyle, background: '#dc2626', color: '#fff', borderColor: '#b91c1c' }}
          title="Download as PDF (.pdf)"
        >
          <i className={`bi ${busy === 'pdf' ? 'bi-arrow-repeat' : 'bi-file-earmark-pdf'}`} style={{ fontSize: 14 }}></i>
          {busy === 'pdf' ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, marginTop: 6, maxWidth: 330 }}>
          {error}
        </div>
      )}
    </div>
  );
}
