import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExcelBuilder, PdfBuilder, type ReportColumn } from './reportDownloads';

interface TestRow {
  slNo: number;
  district: string;
  amount: number;
  share: number;
  detail: string;
}

const columns: ReportColumn<TestRow>[] = [
  { key: 'slNo', label: 'Sl No.', align: 'right' },
  { key: 'district', label: 'District' },
  { key: 'amount', label: 'Amount (₹)', align: 'right' },
  { key: 'share', label: 'Share', align: 'right', numberFormat: '0.0%' },
  { key: 'detail', label: 'Details' },
];

const rows: TestRow[] = [
  { slNo: 91, district: 'Khordha', amount: 125000, share: 0.625, detail: 'A wrapped description '.repeat(4) },
  { slNo: 92, district: 'Cuttack', amount: 75000, share: 0.375, detail: 'Short text' },
];

afterEach(() => vi.restoreAllMocks());

describe('ExcelBuilder', () => {
  it('builds styled, reopenable XLSX with one generated serial column', async () => {
    const builder = new ExcelBuilder('Currency ₹ Report')
      .setFilterSummary(['District: All', 'Sort: Amount descending'])
      .addSheet({
        name: 'Results',
        columns,
        rows,
        totalsRow: { district: 'Total', amount: 200000, share: 1 },
      });

    const workbook = await builder.build();
    const sheet = workbook.getWorksheet('Results');
    expect(sheet).toBeDefined();
    const headerRow = sheet!.getRows(1, sheet!.rowCount)!
      .find((row) => row.getCell(1).value === 'Sl No.');
    expect(headerRow).toBeDefined();
    expect(headerRow!.values).toEqual([undefined, 'Sl No.', 'District', 'Amount (₹)', 'Share', 'Details']);
    expect(headerRow!.getCell(1).fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: '17365D' },
    });
    expect(sheet!.getRow(headerRow!.number + 1).getCell(1).value).toBe(1);
    expect(sheet!.getRow(headerRow!.number + 2).getCell(1).value).toBe(2);
    expect(sheet!.getRow(headerRow!.number + 3).getCell(1).value).toBe('');
    expect(sheet!.getRow(headerRow!.number + 3).getCell(2).value).toBe('Total');
    expect(sheet!.getRow(headerRow!.number + 1).getCell(4).value).toBe(0.625);
    expect(sheet!.getRow(headerRow!.number + 1).getCell(4).numFmt).toBe('0.0%');
    expect(sheet!.getRow(headerRow!.number + 3).getCell(4).numFmt).toBe('0.0%');
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: headerRow!.number });
    expect(sheet!.autoFilter).toBeDefined();

    const bytes = await builder.toBuffer();
    expect(bytes.byteLength).toBeGreaterThan(5_000);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes);
    expect(reopened.getWorksheet('Results')!.getRow(headerRow!.number + 1).getCell(3).value).toBe(125000);
    expect(reopened.getWorksheet('Results')!.getRow(headerRow!.number + 1).getCell(4).numFmt).toBe('0.0%');
    expect(reopened.getWorksheet('Results')!.getCell('A1').value).toBe('Currency ₹ Report');
  });

  it('resets serial numbers for each worksheet and keeps empty sheets valid', async () => {
    const workbook = await new ExcelBuilder('Multi-sheet')
      .addSheet({ name: 'First', columns, rows: rows.slice(0, 1) })
      .addSheet({ name: 'Second', columns, rows: rows.slice(1) })
      .addSheet({ name: 'Empty', columns, rows: [] })
      .build();

    for (const name of ['First', 'Second']) {
      const sheet = workbook.getWorksheet(name)!;
      const header = sheet.getRows(1, sheet.rowCount)!.find((row) => row.getCell(1).value === 'Sl No.')!;
      expect(sheet.getRow(header.number + 1).getCell(1).value).toBe(1);
    }
    expect(workbook.getWorksheet('Empty')!.autoFilter).toBeDefined();
  });

  it('sizes wrapped rows from their actual columns up to Excel’s hard limit', async () => {
    const longTitle = `Long report title ${'with important context '.repeat(35)}`;
    const longDetail = 'A long export value that must remain visible and wrapped. '.repeat(45);
    const workbook = await new ExcelBuilder(longTitle)
      .addSheet({
        name: 'Wrapping',
        columns: [{ key: 'detail', label: 'Detailed title' }],
        rows: [{ detail: longDetail }],
      })
      .build();
    const sheet = workbook.getWorksheet('Wrapping')!;
    const header = sheet.getRows(1, sheet.rowCount)!
      .find((row) => row.getCell(1).value === 'Sl No.')!;
    const dataRow = sheet.getRow(header.number + 1);

    expect(sheet.getRow(1).height).toBeGreaterThan(26);
    expect(dataRow.height).toBeGreaterThan(72);
    expect(dataRow.height).toBe(409);
  });
});

describe('PdfBuilder', () => {
  it('embeds local Unicode fonts and paginates long wrapped tables', async () => {
    const normal = await readFile(fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url)));
    const bold = await readFile(fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url)));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      url.includes('Bold') ? bold : normal,
      { status: 200 },
    )));
    const manyRows = Array.from({ length: 90 }, (_, index) => ({
      ...rows[index % rows.length],
      slNo: 500 + index,
      detail: `₹ ${index + 1}: ${'Long content for reliable wrapping. '.repeat(4)}`,
    }));
    const builder = new PdfBuilder('Long Currency ₹ Report with a title that wraps correctly')
      .setFilterSummary(['District: All districts', 'Status: In progress'])
      .addSection({
        heading: 'Detailed records',
        columns,
        rows: manyRows,
        totalsRow: { district: 'Total', amount: 9_000_000 },
      });

    const document = await builder.build();
    expect(document.getNumberOfPages()).toBeGreaterThan(1);
    expect(document.getFontList()).toHaveProperty('DejaVuSans');
    const bytes = await builder.toArrayBuffer();
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(50_000);

    await expect(
      new PdfBuilder('Unsupported glyph ଓ').addSection({ columns, rows: rows.slice(0, 1) }).build(),
    ).rejects.toThrow(/U\+0B13.*prevent corrupted text/);
  });
});