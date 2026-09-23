// Export libraries and font data are loaded only when a report is requested.
import type ExcelJS from 'exceljs';
import type jsPDFType from 'jspdf';
import {
  assertReportPdfTextSupported,
  loadReportPdfFonts,
  registerReportPdfFonts,
  REPORT_PDF_FONT,
} from './reportPdfFonts';

export type ReportCellValue = string | number | boolean | Date;

export interface ReportColumn<T> {
  key: keyof T | string;
  label: string;
  format?: (row: T) => ReportCellValue;
  align?: 'left' | 'center' | 'right';
  /** Excel number format, for example `0.0%`, `#,##0`, or `dd-mm-yyyy`. */
  numberFormat?: string;
}

export interface ReportSheet<T> {
  name: string;
  columns: ReportColumn<T>[];
  rows: readonly T[];
  totalsRow?: Record<string, string | number>;
}

export interface PdfSection<T> {
  heading?: string;
  columns: ReportColumn<T>[];
  rows: readonly T[];
  totalsRow?: Record<string, string | number>;
}

type Alignment = 'left' | 'center' | 'right' | undefined;

interface PreparedTable {
  name?: string;
  heading?: string;
  header: string[];
  body: ReportCellValue[][];
  aligns: Alignment[];
  numberFormats: (string | undefined)[];
  totalsRowIndex?: number;
  colWidths: number[];
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const REPORT_SUBTITLE = 'Sankalpa Odisha — Sarkari Pratishruti Pratipalan';
export const GENERATED_ON_LABEL = 'Generated On';

export function formatGeneratedOn(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function sanitizeFile(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function buildExcelFilename(reportName: string): string {
  return `${sanitizeFile(reportName)}_${todayStamp()}.xlsx`;
}

export function buildPdfFilename(reportName: string): string {
  return `${sanitizeFile(reportName)}_${todayStamp()}.pdf`;
}

function rowValue<T>(row: T, col: ReportColumn<T>): ReportCellValue {
  if (col.format) return col.format(row);
  const value = (row as unknown as Record<string, unknown>)[col.key as string];
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Date
  ) return value;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function normalizedColumnName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSerialColumn(column: ReportColumn<unknown>): boolean {
  const key = normalizedColumnName(String(column.key));
  const label = normalizedColumnName(column.label);
  return key === 'sl' || key === 'slno' || key === 'serial' || key === 'serialno'
    || label === 'sl' || label === 'slno' || label === 'serial' || label === 'serialno';
}

function displayLength(value: ReportCellValue): number {
  const text = value instanceof Date ? '00-00-0000 00:00' : String(value);
  return text.split(/\r?\n/).reduce((max, line) => Math.max(max, [...line].length), 0);
}

const EXCEL_MAX_ROW_HEIGHT = 409;

function wrappedLineCount(value: ReportCellValue, columnWidth: number): number {
  const text = value instanceof Date ? '00-00-0000 00:00' : String(value);
  // Excel column widths are approximately a count of standard-font characters.
  // Keep a small allowance for cell padding and proportional glyphs.
  const available = Math.max(1, Math.floor(columnWidth - 2));
  return text.split(/\r?\n/).reduce((total, explicitLine) => {
    if (explicitLine.length === 0) return total + 1;
    let lines = 1;
    let used = 0;
    for (const word of explicitLine.split(/(\s+)/).filter(Boolean)) {
      const length = [...word].length;
      if (length > available) {
        const firstLineSpace = Math.max(0, available - used);
        const remaining = Math.max(0, length - firstLineSpace);
        lines += Math.ceil(remaining / available);
        used = remaining % available;
      } else if (used > 0 && used + length > available) {
        lines += 1;
        used = length;
      } else {
        used += length;
      }
    }
    return total + lines;
  }, 0);
}

function excelRowHeight(
  values: readonly ReportCellValue[],
  columnWidths: readonly number[],
  minimum = 20,
): number {
  const lines = values.reduce<number>(
    (maximum, value, index) => Math.max(maximum, wrappedLineCount(value, columnWidths[index] ?? 14)),
    1,
  );
  // Excel rejects row heights above 409 points. Do not impose a lower visual cap.
  return Math.min(EXCEL_MAX_ROW_HEIGHT, Math.max(minimum, lines * 15 + 5));
}

function prepareTable<T>(
  table: ReportSheet<T> | PdfSection<T>,
  details: { name?: string; heading?: string },
): PreparedTable {
  // Serial-number columns supplied by callers are normalized, rather than duplicated.
  const columns = table.columns.filter((column) => !isSerialColumn(column as ReportColumn<unknown>));
  const header = ['Sl No.', ...columns.map((column) => column.label)];
  const body: ReportCellValue[][] = table.rows.map((row, index) => [
    index + 1,
    ...columns.map((column) => rowValue(row, column)),
  ]);
  let totalsRowIndex: number | undefined;
  if (table.totalsRow) {
    totalsRowIndex = body.length;
    body.push([
      '',
      ...columns.map((column) => {
        const value = table.totalsRow?.[column.key as string];
        return value === undefined ? '' : value;
      }),
    ]);
  }

  const aligns: Alignment[] = ['right', ...columns.map((column) => column.align)];
  const numberFormats = [undefined, ...columns.map((column) => column.numberFormat)];
  const colWidths = header.map((label, columnIndex) => {
    if (columnIndex === 0) return 8;
    const bodyWidth = body.reduce(
      (max, row) => Math.max(max, displayLength(row[columnIndex] ?? '')),
      0,
    );
    const numeric = aligns[columnIndex] === 'right';
    return Math.min(48, Math.max(numeric ? 11 : 14, displayLength(label), bodyWidth) + 2);
  });

  return { ...details, header, body, aligns, numberFormats, totalsRowIndex, colWidths };
}

function safeSheetName(name: string): string {
  return name.slice(0, 31).replace(/[\\/?*:[\]]/g, '_') || 'Sheet1';
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = safeSheetName(name);
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate.toLowerCase())) {
    const ending = ` (${++suffix})`;
    candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function triggerBrowserDownload(data: BlobPart, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const COLORS = {
  navy: '17365D',
  blue: 'DCE6F1',
  pale: 'F5F8FC',
  border: 'B8C7D9',
  muted: '5B6573',
  white: 'FFFFFF',
};

export class ExcelBuilder {
  private prepared: PreparedTable[] = [];
  private filterSummary?: string[];

  constructor(private reportName: string) {}

  setFilterSummary(lines: string[]): this {
    this.filterSummary = lines.filter((line) => line.trim().length > 0);
    return this;
  }

  addSheet<T>(sheet: ReportSheet<T>): this {
    this.prepared.push(prepareTable(sheet, { name: sheet.name }));
    return this;
  }

  /** Builds a real ExcelJS workbook without downloading it. */
  async build(): Promise<ExcelJS.Workbook> {
    const module = await import('exceljs');
    const ExcelModule = module.default ?? module;
    const workbook = new ExcelModule.Workbook();
    workbook.creator = 'Sankalpa Odisha';
    workbook.title = this.reportName;
    workbook.subject = REPORT_SUBTITLE;
    workbook.created = new Date();
    workbook.modified = new Date();

    const tables = this.prepared.length > 0
      ? this.prepared
      : [prepareTable({ name: 'Report', columns: [], rows: [] }, { name: 'Report' })];
    const names = new Set<string>();
    for (const table of tables) {
      const worksheet = workbook.addWorksheet(uniqueSheetName(table.name ?? 'Report', names), {
        pageSetup: {
          orientation: table.header.length > 7 ? 'landscape' : 'portrait',
          paperSize: 9,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.25, right: 0.25, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
        },
        properties: { defaultRowHeight: 18 },
      });
      const columnCount = Math.max(1, table.header.length);
      worksheet.mergeCells(1, 1, 1, columnCount);
      worksheet.getCell(1, 1).value = this.reportName;
      worksheet.mergeCells(2, 1, 2, columnCount);
      worksheet.getCell(2, 1).value = REPORT_SUBTITLE;
      worksheet.mergeCells(3, 1, 3, columnCount);
      worksheet.getCell(3, 1).value = `${GENERATED_ON_LABEL}: ${formatGeneratedOn()}`;

      let nextRow = 4;
      if (this.filterSummary?.length) {
        for (const line of this.filterSummary) {
          worksheet.mergeCells(nextRow, 1, nextRow, columnCount);
          worksheet.getCell(nextRow, 1).value = `Filter: ${line}`;
          worksheet.getCell(nextRow, 1).alignment = { wrapText: true, vertical: 'middle' };
          worksheet.getCell(nextRow, 1).font = { italic: true, color: { argb: COLORS.muted } };
          worksheet.getRow(nextRow).height = excelRowHeight(
            [`Filter: ${line}`],
            [table.colWidths.reduce((sum, width) => sum + width, 0)],
          );
          nextRow += 1;
        }
      }
      worksheet.mergeCells(nextRow, 1, nextRow, columnCount);
      worksheet.getCell(nextRow, 1).value = `Records: ${table.totalsRowIndex ?? table.body.length}`;
      worksheet.getCell(nextRow, 1).font = { bold: true, color: { argb: COLORS.muted } };
      const headerRowNumber = nextRow + 2;
      const headerRow = worksheet.getRow(headerRowNumber);
      headerRow.values = table.header;
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: COLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.border } },
          left: { style: 'thin', color: { argb: COLORS.border } },
          bottom: { style: 'thin', color: { argb: COLORS.border } },
          right: { style: 'thin', color: { argb: COLORS.border } },
        };
      });

      table.body.forEach((values, index) => {
        const row = worksheet.getRow(headerRowNumber + index + 1);
        row.values = values;
        const total = index === table.totalsRowIndex;
        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          const align = table.aligns[columnNumber - 1];
          cell.alignment = {
            horizontal: align ?? (typeof cell.value === 'number' ? 'right' : 'left'),
            vertical: 'top',
            wrapText: true,
          };
          cell.border = {
            bottom: { style: 'hair', color: { argb: COLORS.border } },
          };
          const numberFormat = table.numberFormats[columnNumber - 1];
          if (numberFormat) cell.numFmt = numberFormat;
          else if (cell.value instanceof Date) cell.numFmt = 'dd-mm-yyyy hh:mm';
          if (total) {
            cell.font = { bold: true, color: { argb: COLORS.navy } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blue } };
          } else if (index % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.pale } };
          }
        });
        row.height = excelRowHeight(values, table.colWidths);
      });

      const mergedWidth = table.colWidths.reduce((sum, width) => sum + width, 0);
      worksheet.getRow(1).height = excelRowHeight([this.reportName], [mergedWidth], 26);
      worksheet.getRow(2).height = excelRowHeight([REPORT_SUBTITLE], [mergedWidth], 20);
      worksheet.getRow(3).height = excelRowHeight(
        [`${GENERATED_ON_LABEL}: ${formatGeneratedOn()}`],
        [mergedWidth],
        18,
      );
      worksheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: COLORS.navy } };
      worksheet.getCell(2, 1).font = { italic: true, size: 10, color: { argb: COLORS.muted } };
      worksheet.getCell(3, 1).font = { size: 9, color: { argb: COLORS.muted } };
      for (let row = 1; row <= 3; row += 1) {
        worksheet.getCell(row, 1).alignment = { vertical: 'middle', wrapText: true };
      }
      worksheet.columns.forEach((column, index) => {
        column.width = table.colWidths[index] ?? 14;
      });
      worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber, activeCell: `A${headerRowNumber + 1}` }];
      worksheet.autoFilter = {
        from: { row: headerRowNumber, column: 1 },
        to: { row: headerRowNumber, column: table.header.length },
      };
      worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
      worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(table.header.length).letter}${worksheet.rowCount}`;
      worksheet.headerFooter.oddFooter = '&LSankalpa Odisha&C&F&RPage &P of &N';
    }
    return workbook;
  }

  async toBuffer(): Promise<ArrayBuffer> {
    const workbook = await this.build();
    return workbook.xlsx.writeBuffer();
  }

  async download(): Promise<void> {
    const buffer = await this.toBuffer();
    triggerBrowserDownload(
      buffer,
      buildExcelFilename(this.reportName),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }
}

interface AutoTableDocument extends jsPDFType {
  lastAutoTable?: { finalY: number };
}

function pdfColumnWidths(table: PreparedTable, available: number): {
  widths: number[];
  useHorizontalBreak: boolean;
} {
  const points = table.colWidths.map((width, index) => index === 0 ? 38 : Math.max(52, width * 5.1));
  const total = points.reduce((sum, width) => sum + width, 0);
  if (total <= available) {
    const spare = available - total;
    const expandable = Math.max(1, points.length - 1);
    return {
      widths: points.map((width, index) => index === 0 ? width : width + spare / expandable),
      useHorizontalBreak: false,
    };
  }
  const minimum = points.reduce((sum, width, index) => sum + (index === 0 ? 38 : Math.min(width, 52)), 0);
  if (minimum > available) return { widths: points, useHorizontalBreak: true };
  const scale = (available - 38) / (total - 38);
  return {
    widths: points.map((width, index) => index === 0 ? 38 : Math.max(52, width * scale)),
    useHorizontalBreak: false,
  };
}

export class PdfBuilder {
  private prepared: PreparedTable[] = [];
  private filterSummary?: string[];
  private orientation: 'portrait' | 'landscape' = 'landscape';

  constructor(private reportName: string) {}

  setFilterSummary(lines: string[]): this {
    this.filterSummary = lines.filter((line) => line.trim().length > 0);
    return this;
  }

  setOrientation(orientation: 'portrait' | 'landscape'): this {
    this.orientation = orientation;
    return this;
  }

  addSection<T>(section: PdfSection<T>): this {
    this.prepared.push(prepareTable(section, { heading: section.heading }));
    return this;
  }

  /** Builds a jsPDF document without saving it, for previewing and tests. */
  async build(): Promise<jsPDFType> {
    const [{ default: jsPDF }, { default: autoTable }, fonts] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      loadReportPdfFonts(),
    ]);
    const doc = new jsPDF({ orientation: this.orientation, unit: 'pt', format: 'a4', putOnlyUsedFonts: true });
    registerReportPdfFonts(doc, fonts);
    assertReportPdfTextSupported(doc, [
      this.reportName,
      REPORT_SUBTITLE,
      ...(this.filterSummary ?? []),
      ...this.prepared.flatMap((table) => [
        table.heading ?? '',
        ...table.header,
        ...table.body.flatMap((row) => row.map((value) => String(value))),
      ]),
    ]);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 40;
    const right = 40;
    const topMargin = 54;
    const bottomMargin = 36;
    const contentWidth = pageWidth - left - right;

    doc.setFont(REPORT_PDF_FONT, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(23, 54, 93);
    const titleLines = doc.splitTextToSize(this.reportName, contentWidth);
    doc.text(titleLines, left, 38);
    let cursorY = 38 + titleLines.length * 17;

    doc.setFont(REPORT_PDF_FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(91, 101, 115);
    const subtitleLines = doc.splitTextToSize(REPORT_SUBTITLE, contentWidth * 0.68);
    doc.text(subtitleLines, left, cursorY);
    doc.text(`${GENERATED_ON_LABEL}: ${formatGeneratedOn()}`, pageWidth - right, cursorY, { align: 'right' });
    cursorY += Math.max(12, subtitleLines.length * 11) + 8;

    if (this.filterSummary?.length) {
      doc.setFillColor(245, 248, 252);
      const filterLines = doc.splitTextToSize(`Filters: ${this.filterSummary.join('  •  ')}`, contentWidth - 16);
      const boxHeight = filterLines.length * 11 + 12;
      const boxTop = cursorY - 9;
      doc.roundedRect(left, boxTop, contentWidth, boxHeight, 3, 3, 'F');
      doc.setFont(REPORT_PDF_FONT, 'normal');
      doc.setTextColor(51, 65, 85);
      const firstLineCenter = boxTop + boxHeight / 2 - (filterLines.length - 1) * 11 / 2;
      filterLines.forEach((line: string, index: number) => {
        doc.text(line, left + 8, firstLineCenter + index * 11, { baseline: 'middle' });
      });
      cursorY += boxHeight + 5;
    }

    const tables = this.prepared.length > 0
      ? this.prepared
      : [prepareTable({ columns: [], rows: [] }, {})];
    for (let index = 0; index < tables.length; index += 1) {
      const table = tables[index];
      if (index > 0) cursorY += 14;
      if (cursorY > pageHeight - bottomMargin - 70) {
        doc.addPage();
        cursorY = topMargin;
      }
      if (table.heading) {
        doc.setFont(REPORT_PDF_FONT, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(23, 54, 93);
        const headingLines = doc.splitTextToSize(table.heading, contentWidth);
        doc.text(headingLines, left, cursorY);
        cursorY += headingLines.length * 13 + 2;
      }

      const { widths, useHorizontalBreak } = pdfColumnWidths(table, contentWidth);
      const columnStyles = table.aligns.reduce<Record<number, {
        halign?: 'left' | 'center' | 'right';
        cellWidth: number;
      }>>((styles, align, columnIndex) => {
        styles[columnIndex] = { halign: align, cellWidth: widths[columnIndex] };
        return styles;
      }, {});
      autoTable(doc, {
        head: [table.header],
        body: table.body.map((row) => row.map((value) => value instanceof Date ? formatGeneratedOn(value) : String(value))),
        startY: cursorY + 4,
        margin: { top: topMargin, right, bottom: bottomMargin, left },
        theme: 'grid',
        styles: {
          font: REPORT_PDF_FONT,
          fontStyle: 'normal',
          fontSize: useHorizontalBreak ? 7.2 : 8,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          overflow: 'linebreak',
          valign: 'top',
          lineColor: [184, 199, 217],
          lineWidth: 0.35,
          textColor: [34, 45, 59],
        },
        headStyles: {
          fillColor: [23, 54, 93],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        columnStyles,
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        horizontalPageBreak: useHorizontalBreak,
        horizontalPageBreakRepeat: 0,
        horizontalPageBreakBehaviour: 'afterAllRows',
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === table.totalsRowIndex) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 230, 241];
            data.cell.styles.textColor = [23, 54, 93];
          }
        },
      });
      cursorY = (doc as AutoTableDocument).lastAutoTable?.finalY ?? cursorY;
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      if (page > 1) {
        doc.setDrawColor(184, 199, 217);
        doc.line(left, 34, pageWidth - right, 34);
        doc.setFont(REPORT_PDF_FONT, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(23, 54, 93);
        const runningTitle = doc.splitTextToSize(this.reportName, contentWidth * 0.75)[0] ?? this.reportName;
        doc.text(runningTitle, left, 27);
        doc.setFont(REPORT_PDF_FONT, 'normal');
        doc.setTextColor(91, 101, 115);
        doc.text(REPORT_SUBTITLE, pageWidth - right, 27, { align: 'right' });
      }
      doc.setDrawColor(184, 199, 217);
      doc.line(left, pageHeight - 27, pageWidth - right, pageHeight - 27);
      doc.setFont(REPORT_PDF_FONT, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(91, 101, 115);
      doc.text('Sankalpa Odisha — Reports', left, pageHeight - 16);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - right, pageHeight - 16, { align: 'right' });
    }
    return doc;
  }

  async toArrayBuffer(): Promise<ArrayBuffer> {
    const doc = await this.build();
    return doc.output('arraybuffer');
  }

  async download(): Promise<void> {
    const doc = await this.build();
    doc.save(buildPdfFilename(this.reportName));
  }
}

export function downloadExcel<T>(opts: {
  reportName: string;
  sheets: ReportSheet<T>[];
  filterSummary?: string[];
}): Promise<void> {
  const builder = new ExcelBuilder(opts.reportName);
  if (opts.filterSummary) builder.setFilterSummary(opts.filterSummary);
  for (const sheet of opts.sheets) builder.addSheet(sheet);
  return builder.download();
}

export function downloadPdf<T>(opts: {
  reportName: string;
  filterSummary?: string[];
  sections: PdfSection<T>[];
  orientation?: 'portrait' | 'landscape';
}): Promise<void> {
  const builder = new PdfBuilder(opts.reportName);
  if (opts.filterSummary) builder.setFilterSummary(opts.filterSummary);
  if (opts.orientation) builder.setOrientation(opts.orientation);
  for (const section of opts.sections) builder.addSection(section);
  return builder.download();
}