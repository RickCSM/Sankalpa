import type { ReactNode } from 'react';
import ReportDownloadButtons from './ReportDownloadButtons';
import { REPORT_SUBTITLE, GENERATED_ON_LABEL, formatGeneratedOn } from '@/lib/reportDownloads';

interface Props {
  title: string;
  above?: ReactNode;
  onExcel: () => void | Promise<void>;
  onPdf: () => void | Promise<void>;
  disabled?: boolean;
}

export default function ReportHeader({ title, above, onExcel, onPdf, disabled }: Props) {
  return (
    <div className="page-header report-header">
      <div className="report-header-text">
        {above}
        <h4>{title}</h4>
        <div className="report-subtitle">{REPORT_SUBTITLE}</div>
        <div className="report-generated">{GENERATED_ON_LABEL}: {formatGeneratedOn()}</div>
      </div>
      <ReportDownloadButtons onExcel={onExcel} onPdf={onPdf} disabled={disabled} />
    </div>
  );
}
