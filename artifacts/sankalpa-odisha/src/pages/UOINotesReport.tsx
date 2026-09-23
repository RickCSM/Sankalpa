import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import {
  useGetUoiNotesReport,
  getGetUoiNotesReportQueryKey,
} from '@workspace/api-client-react';
import ReportDownloadButtons from '@/components/ReportDownloadButtons';
import {
  REPORT_SUBTITLE,
  GENERATED_ON_LABEL,
  formatGeneratedOn,
  ExcelBuilder,
  PdfBuilder,
  type ReportColumn,
} from '@/lib/reportDownloads';

const REPORT_NAME = 'UOI Notes Report';
const PIE_COLORS = ['#1a3a5c', '#2563eb', '#79D1AD', '#FDC24A', '#AFA9EE', '#F58E8E', '#0ea5e9', '#f97316'];

interface CountItem {
  name: string;
  count: number;
}

interface MonthItem {
  month: string;
  count: number;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!y || idx < 0 || idx > 11) return ym;
  return `${names[idx]} ${y}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(match[2]) - 1];
  return month ? `${match[3]} ${month} ${match[1]}` : iso;
}

function pct(count: number, total: number): string {
  if (!total) return '0.0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

export default function UOINotesReport() {
  const { can } = useAuth();
  const canDownload = can('download_uoi_reports');

  const { data, isLoading, isError } = useGetUoiNotesReport({
    query: { queryKey: getGetUoiNotesReportQueryKey(), staleTime: 60 * 1000 },
  });

  const kpis = data?.kpis;
  const byDepartment = useMemo<CountItem[]>(() => data?.byDepartment ?? [], [data]);
  const byOccasion = useMemo<CountItem[]>(() => data?.byOccasion ?? [], [data]);
  const byLocation = useMemo<CountItem[]>(() => data?.byLocation ?? [], [data]);
  const byMonth = useMemo<MonthItem[]>(() => data?.byMonth ?? [], [data]);
  const notes = useMemo(() => data?.notes ?? [], [data]);

  const total = kpis?.totalNotes ?? 0;
  const isEmpty = !isLoading && !isError && total === 0;

  const deptChartData = useMemo(
    () =>
      byDepartment.slice(0, 10).map((d) => ({
        name: d.name.length > 22 ? d.name.slice(0, 22) + '…' : d.name,
        Notes: d.count,
      })),
    [byDepartment],
  );

  const monthChartData = useMemo(
    () => byMonth.map((m) => ({ name: formatMonth(m.month), Notes: m.count })),
    [byMonth],
  );

  const occasionChartData = useMemo(() => {
    const top = byOccasion.slice(0, 7).map((o) => ({ name: o.name, value: o.count }));
    const rest = byOccasion.slice(7);
    if (rest.length > 0) {
      top.push({ name: 'Others', value: rest.reduce((s, o) => s + o.count, 0) });
    }
    return top;
  }, [byOccasion]);

  // Plain-language insights
  const topDept = byDepartment[0];
  const topOccasion = byOccasion[0];
  const busiestMonth = useMemo(
    () => byMonth.reduce<MonthItem | null>((best, m) => (!best || m.count > best.count ? m : best), null),
    [byMonth],
  );

  // ---- Downloads ----
  type CountExportRow = { name: string; count: number; share: number };
  const countColumns: ReportColumn<CountExportRow>[] = [
    { key: 'name', label: 'Name' },
    { key: 'count', label: 'Notes', align: 'center' },
    { key: 'share', label: 'Share', align: 'center', numberFormat: '0.0%' },
  ];
  const pdfCountColumns: ReportColumn<CountExportRow>[] = [
    { key: 'name', label: 'Name' },
    { key: 'count', label: 'Notes', align: 'center' },
    { key: 'share', label: 'Share', align: 'center', format: r => `${(r.share * 100).toFixed(1)}%` },
  ];

  const withShare = (rows: CountItem[]) => rows.map((r) => ({ name: r.name, count: r.count, share: total ? r.count / total : 0 }));
  const sumCount = (rows: CountItem[]) => rows.reduce((s, r) => s + r.count, 0);
  const totalsRowFor = (rows: CountItem[]) => {
    const s = sumCount(rows);
    return { name: 'Total', count: s, share: total ? s / total : 0 };
  };
  const pdfTotalsRowFor = (rows: CountItem[]) => {
    const s = sumCount(rows);
    return { name: 'Total', count: s, share: pct(s, total) };
  };

  const kpiRows = useMemo(
    () => [
      { metric: 'Total Notes', value: total },
      { metric: 'Departments Covered', value: kpis?.departmentsCovered ?? 0 },
      { metric: 'Distinct Occasions', value: kpis?.occasionsCount ?? 0 },
      { metric: 'Distinct Locations', value: kpis?.locationsCount ?? 0 },
      { metric: 'Notes in Last 30 Days', value: kpis?.recentCount ?? 0 },
      { metric: 'First Note', value: formatDate(kpis?.firstNoteDate) },
      { metric: 'Latest Note', value: formatDate(kpis?.lastNoteDate) },
    ],
    [kpis, total],
  );
  const kpiColumns: ReportColumn<{ metric: string; value: string | number }>[] = [
    { key: 'metric', label: 'Metric' },
    { key: 'value', label: 'Value', align: 'center' },
  ];

  // Tabular listing of every UOI note (matches the on-screen list columns).
  interface NoteRow {
    title: string;
    department: string;
    date: string;
    location: string;
    occasion: string;
  }
  const noteRows = useMemo<NoteRow[]>(
    () =>
      notes.map((n) => ({
        title: n.title || '—',
        department: n.departmentName || '—',
        date: n.date && n.date.trim() ? formatDate(n.date) : '—',
        location: n.location && n.location.trim() ? n.location : '—',
        occasion: n.occasion && n.occasion.trim() ? n.occasion : '—',
      })),
    [notes],
  );
  const noteColumns: ReportColumn<NoteRow>[] = [
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'date', label: 'Date', align: 'center' },
    { key: 'location', label: 'Location' },
    { key: 'occasion', label: 'Occasion' },
  ];

  const filterSummary = ['Scope: All UOI notes', `Records: ${noteRows.length}`];

  const handleExcel = (): Promise<void> => {
    const b = new ExcelBuilder(REPORT_NAME);
    b.setFilterSummary(filterSummary);
    b.addSheet({ name: 'UOI Notes', columns: noteColumns, rows: noteRows });
    b.addSheet({ name: 'Summary', columns: kpiColumns, rows: kpiRows });
    b.addSheet({
      name: 'By Department',
      columns: countColumns,
      rows: withShare(byDepartment),
      totalsRow: { name: 'Total', count: total, share: total ? 1 : 0 },
    });
    b.addSheet({
      name: 'By Occasion',
      columns: countColumns,
      rows: withShare(byOccasion),
      totalsRow: totalsRowFor(byOccasion),
    });
    b.addSheet({
      name: 'By Location',
      columns: countColumns,
      rows: withShare(byLocation),
      totalsRow: totalsRowFor(byLocation),
    });
    b.addSheet({
      name: 'By Month',
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'count', label: 'Notes', align: 'center' },
      ],
      rows: byMonth.map((m) => ({ month: formatMonth(m.month), count: m.count })),
      totalsRow: { month: 'Total', count: total },
    });
    return b.download();
  };

  const handlePdf = (): Promise<void> => {
    const b = new PdfBuilder(REPORT_NAME);
    b.setOrientation('landscape');
    b.setFilterSummary(filterSummary);
    b.addSection({ heading: 'UOI Notes', columns: noteColumns, rows: noteRows });
    b.addSection({ heading: 'Summary', columns: kpiColumns, rows: kpiRows });
    b.addSection({
      heading: 'By Department',
      columns: pdfCountColumns,
      rows: withShare(byDepartment),
      totalsRow: { name: 'Total', count: total, share: total ? '100.0%' : '0.0%' },
    });
    b.addSection({
      heading: 'By Occasion',
      columns: pdfCountColumns,
      rows: withShare(byOccasion),
      totalsRow: pdfTotalsRowFor(byOccasion),
    });
    b.addSection({
      heading: 'By Location',
      columns: pdfCountColumns,
      rows: withShare(byLocation),
      totalsRow: pdfTotalsRowFor(byLocation),
    });
    b.addSection({
      heading: 'By Month',
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'count', label: 'Notes', align: 'center' },
      ],
      rows: byMonth.map((m) => ({ month: formatMonth(m.month), count: m.count })),
      totalsRow: { month: 'Total', count: total },
    });
    return b.download();
  };

  const kpiCards: { label: string; value: number; icon: string; cls: string }[] = [
    { label: 'Total Notes', value: total, icon: 'bi-journal-text', cls: 'primary' },
    { label: 'Departments Covered', value: kpis?.departmentsCovered ?? 0, icon: 'bi-building', cls: 'card-completed' },
    { label: 'Distinct Occasions', value: kpis?.occasionsCount ?? 0, icon: 'bi-calendar-event', cls: 'card-inreview' },
    { label: 'Distinct Locations', value: kpis?.locationsCount ?? 0, icon: 'bi-geo-alt', cls: 'card-inprogress' },
    { label: 'Last 30 Days', value: kpis?.recentCount ?? 0, icon: 'bi-clock-history', cls: 'card-not-started' },
  ];

  const renderTable = (heading: string, label: string, rows: CountItem[], showTotal: boolean) => (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <h5 style={{ color: '#1a3a5c', fontWeight: 700, marginBottom: 12 }}>{heading}</h5>
        {rows.length === 0 ? (
          <div style={{ color: '#999', padding: 12 }}>No data recorded.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Sl No.</th>
                  <th>{label}</th>
                  <th className="text-center" style={{ width: 120 }}>Notes</th>
                  <th className="text-center" style={{ width: 120 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.name}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{r.name || '—'}</td>
                    <td className="text-center">{r.count}</td>
                    <td className="text-center">{pct(r.count, total)}</td>
                  </tr>
                ))}
                {showTotal && (
                  <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                    <td></td>
                    <td>Total</td>
                    <td className="text-center">{sumCount(rows)}</td>
                    <td className="text-center">{pct(sumCount(rows), total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="page-container">
        <div className="inner-page-layout">
          <div className="page-header report-header">
            <div className="report-header-text">
              <h4>{REPORT_NAME}</h4>
              <div className="report-subtitle">{REPORT_SUBTITLE}</div>
              <div className="report-generated">{GENERATED_ON_LABEL}: {formatGeneratedOn()}</div>
            </div>
            {canDownload && (
              <ReportDownloadButtons onExcel={handleExcel} onPdf={handlePdf} disabled={isEmpty || isLoading} />
            )}
          </div>

          {isLoading && (
            <div className="card"><div className="card-body" style={{ textAlign: 'center', color: '#1a3a5c', padding: 32 }}>Loading report…</div></div>
          )}

          {isError && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 8 }}></i>
              Unable to load the UOI Notes report. Please try again.
            </div>
          )}

          {isEmpty && (
            <div className="card"><div className="card-body" style={{ textAlign: 'center', color: '#999', padding: 32 }}>
              <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}></i>
              No UOI notes have been recorded yet. Insights will appear here once notes are added.
            </div></div>
          )}

          {!isLoading && !isError && !isEmpty && (
            <>
              {/* KPI cards */}
              <div className="widget-area" style={{ marginBottom: 16 }}>
                <div className="row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {kpiCards.map((c) => (
                    <div key={c.label} style={{ flex: '1 1 180px', minWidth: 180 }}>
                      <div className={`card ${c.cls}`}>
                        <div className="card-body">
                          <div className="widget-content">
                            <div className="col-icon"><div className="widget-icon"><i className={`bi ${c.icon}`}></i></div></div>
                            <div className="col-details">
                              <div className="widget-title">{c.label}</div>
                              <span className="widget-count">{c.value}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insight callouts */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {topDept && (
                  <div className="alert alert-info" style={{ flex: '1 1 280px', marginBottom: 0 }}>
                    <i className="bi bi-lightbulb" style={{ marginRight: 8 }}></i>
                    <strong>{topDept.name}</strong> leads with <strong>{topDept.count}</strong> note{topDept.count === 1 ? '' : 's'} ({pct(topDept.count, total)} of all notes).
                  </div>
                )}
                {busiestMonth && (
                  <div className="alert alert-info" style={{ flex: '1 1 280px', marginBottom: 0 }}>
                    <i className="bi bi-graph-up" style={{ marginRight: 8 }}></i>
                    Busiest month was <strong>{formatMonth(busiestMonth.month)}</strong> with <strong>{busiestMonth.count}</strong> note{busiestMonth.count === 1 ? '' : 's'}.
                  </div>
                )}
                {topOccasion && (
                  <div className="alert alert-info" style={{ flex: '1 1 280px', marginBottom: 0 }}>
                    <i className="bi bi-star" style={{ marginRight: 8 }}></i>
                    Most common occasion: <strong>{topOccasion.name}</strong> ({topOccasion.count} note{topOccasion.count === 1 ? '' : 's'}).
                  </div>
                )}
              </div>

              {/* Charts */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: '1 1 480px', minWidth: 360 }}>
                  <div className="card">
                    <div className="card-body">
                      <h5 style={{ color: '#1a3a5c', fontWeight: 700, marginBottom: 12 }}>Notes by Department (Top 10)</h5>
                      <div style={{ height: 360 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deptChartData} layout="vertical" margin={{ left: 20, right: 20, top: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="Notes" fill="#1a3a5c" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: '1 1 360px', minWidth: 320 }}>
                  <div className="card">
                    <div className="card-body">
                      <h5 style={{ color: '#1a3a5c', fontWeight: 700, marginBottom: 12 }}>Occasion Distribution</h5>
                      <div style={{ height: 360 }}>
                        {occasionChartData.length === 0 ? (
                          <div style={{ color: '#999', padding: 24 }}>No occasions recorded.</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={occasionChartData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={110} label={(e) => `${e.value}`}>
                                {occasionChartData.map((_, i) => (
                                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-body">
                  <h5 style={{ color: '#1a3a5c', fontWeight: 700, marginBottom: 12 }}>Month-wise Trend</h5>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthChartData} margin={{ left: 10, right: 20, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="Notes" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Breakdown tables */}
              {renderTable('Department-wise Breakdown', 'Department', byDepartment, true)}
              {renderTable('Occasion-wise Breakdown', 'Occasion', byOccasion, true)}
              {renderTable('Location-wise Breakdown', 'Location', byLocation, true)}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
