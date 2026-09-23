/**
 * Read-only end-to-end validation for task #276 report downloads.
 *
 * Usage:
 *   cd scripts
 *   npx tsx src/validate-report-exports.ts --prepare
 *   npx tsx src/validate-report-exports.ts
 *
 * Downloads, PDF renders, extracted text, and qa-report.json are written only
 * below /tmp. The script deliberately does not submit any mutating app form.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, "../..");
const appNodeModules = resolve(workspace, "artifacts/sankalpa-odisha/node_modules");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot =
  process.env.REPORT_QA_OUT ?? `/tmp/task-276-report-exports-${stamp}`;
const downloadDir = resolve(outputRoot, "downloads");
const renderDir = resolve(outputRoot, "pdf-renders");
const textDir = resolve(outputRoot, "pdf-text");
const prepareOnly = process.argv.includes("--prepare");
const targetedOnly = process.argv.includes("--targeted");

type Check = {
  scope: string;
  status: "pass" | "fail" | "warn";
  message: string;
};

type ArtifactResult = {
  id: string;
  kind: "pdf" | "xlsx";
  file?: string;
  screen?: ScreenSnapshot;
  checks: Check[];
};

type ScreenSnapshot = {
  path: string;
  title: string;
  bodySummary: string;
  tableHeaders: string[][];
  tableRows: string[][][];
};

const checks: Check[] = [];
const artifacts: ArtifactResult[] = [];
const browserErrors: string[] = [];

function check(
  scope: string,
  condition: boolean,
  pass: string,
  fail: string,
  severity: "fail" | "warn" = "fail",
) {
  checks.push({
    scope,
    status: condition ? "pass" : severity,
    message: condition ? pass : fail,
  });
  return condition;
}

function resolveBinary(...names: string[]) {
  for (const name of names) {
    try {
      const value = execSync(`which ${name} 2>/dev/null`, {
        encoding: "utf8",
      }).trim();
      if (value) return value;
    } catch {
      // Try the next name.
    }
  }
  return "";
}

const chromium = process.env.CHROMIUM_PATH || resolveBinary("chromium", "chromium-browser");
const pdftoppm = resolveBinary("pdftoppm");
const pdftotext = resolveBinary("pdftotext");
const pdfinfo = resolveBinary("pdfinfo");
const excelEntry = resolve(appNodeModules, "exceljs/excel.js");

const coverage = [
  "Location summary: PDF + Excel",
  "Department summary: PDF + Excel",
  "Announcement & Progress (active department filter): PDF + Excel",
  "Occasion summary: PDF + Excel",
  "Ageing analysis (Department Breakdown + Detailed Aging): PDF + Excel",
  "UOI Notes (all six worksheets): PDF + Excel",
  "Location district/block summary: PDF + Excel",
  "Location announcement detail: PDF + Excel",
  "Department announcement detail: PDF + Excel",
  "Occasion announcement detail: PDF + Excel",
  "HCM Announcements selected-column Excel",
];

function printPreparation() {
  console.log("Task #276 export validation harness is ready.");
  console.log(`Output directory: ${outputRoot}`);
  console.log("Coverage:");
  coverage.forEach((item) => console.log(`  - ${item}`));
  const tools = [
    ["Chromium", chromium],
    ["pdftoppm", pdftoppm],
    ["pdftotext", pdftotext],
    ["pdfinfo", pdfinfo],
    ["ExcelJS", existsSync(excelEntry) ? excelEntry : ""],
  ];
  for (const [name, path] of tools) {
    console.log(`  ${path ? "OK" : "MISSING"} ${name}${path ? `: ${path}` : ""}`);
  }
}

if (prepareOnly) {
  printPreparation();
  process.exit(0);
}

const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) throw new Error("REPLIT_DEV_DOMAIN is not set");
if (!chromium) throw new Error("Chromium was not found");
if (!pdftoppm || !pdftotext || !pdfinfo) {
  throw new Error("pdftoppm, pdftotext, and pdfinfo are required");
}
if (!existsSync(excelEntry)) {
  throw new Error(`ExcelJS is not installed at ${excelEntry}`);
}

for (const directory of [downloadDir, renderDir, textDir]) {
  mkdirSync(directory, { recursive: true });
}

const baseUrl = `https://${domain}`;

async function sleep(ms: number) {
  await new Promise((done) => setTimeout(done, ms));
}

async function spaGoto(page: Page, path: string) {
  await page.evaluate((to) => window.history.pushState(null, "", to), path);
  await page.waitForFunction(
    (to) => location.pathname + location.search === to,
    { timeout: 10_000 },
    path,
  );
  await page
    .waitForFunction(
      () =>
        !document.body.innerText.includes("Loading...") &&
        !document.body.innerText.includes("Loading…"),
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await sleep(900);
  const landed = await page.evaluate(() => location.pathname);
  if (landed === "/login") throw new Error(`SPA navigation to ${path} landed on login`);
}

async function loginReadOnly(page: Page) {
  await page.goto(`${baseUrl}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username: "cmo_nodal", password: "Cmo@123" }),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      mustChangePassword: !!body?.user?.mustChangePassword,
      message: body?.message,
    };
  });
  if (!result.ok) {
    throw new Error(`Demo login failed (${result.status}): ${result.message ?? "unknown error"}`);
  }
  if (result.mustChangePassword) {
    throw new Error("Demo account requires a password change; refusing to mutate data");
  }
  await page.goto(`${baseUrl}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await sleep(1200);
  if (new URL(page.url()).pathname === "/login") {
    throw new Error("Authenticated root bootstrap returned to login");
  }
}

async function snapshotScreen(page: Page): Promise<ScreenSnapshot> {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    return {
      path: location.pathname + location.search,
      title: (
        document.querySelector(".report-header h4, .page-header h4")?.textContent ?? ""
      ).replace(/\s+/g, " ").trim(),
      bodySummary: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2000),
      tableHeaders: tables.map((table) =>
        Array.from(table.querySelectorAll("thead th")).map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
      ),
      tableRows: tables.map((table) =>
        Array.from(table.querySelectorAll("tbody tr")).map((row) =>
          Array.from(row.querySelectorAll("td")).map((cell) =>
            (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
          ),
        ),
      ),
    };
  });
}

function filesInDownloads() {
  return new Map(
    readdirSync(downloadDir).map((name) => [
      name,
      statSync(resolve(downloadDir, name)).size,
    ]),
  );
}

async function waitForNewDownload(before: Map<string, number>, timeout = 45_000) {
  const started = Date.now();
  let previous = "";
  let stable = 0;
  while (Date.now() - started < timeout) {
    const candidates = readdirSync(downloadDir)
      .filter((name) => !name.endsWith(".crdownload"))
      .filter((name) => !before.has(name))
      .map((name) => resolve(downloadDir, name));
    if (candidates.length) {
      const newest = candidates.sort(
        (a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs,
      )[0];
      const marker = `${newest}:${statSync(newest).size}`;
      stable = marker === previous ? stable + 1 : 0;
      previous = marker;
      if (stable >= 2 && statSync(newest).size > 0) return newest;
    }
    await sleep(300);
  }
  throw new Error("Timed out waiting for browser download");
}

async function clickDownload(page: Page, label: "Excel" | "PDF") {
  const before = filesInDownloads();
  const clicked = await page.evaluate((wanted) => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(`Download ${wanted}`),
    ) as HTMLButtonElement | undefined;
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Enabled Download ${label} button not found`);
  return waitForNewDownload(before);
}

function readPdfInfo(file: string) {
  const raw = execFileSync(pdfinfo, [file], { encoding: "utf8" });
  const pages = Number(raw.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
  const size = raw.match(/^Page size:\s+(.+)$/m)?.[1]?.trim() ?? "";
  return { pages, size, raw };
}

function validatePdf(id: string, file: string, screen: ScreenSnapshot) {
  const localChecks: Check[] = [];
  const info = readPdfInfo(file);
  const txtFile = resolve(textDir, `${id}.txt`);
  execFileSync(pdftotext, ["-layout", file, txtFile]);
  const text = readFileSync(txtFile, "utf8").replace(/\u0000/g, "");
  const prefix = resolve(renderDir, id);
  execFileSync(pdftoppm, ["-png", "-r", "110", file, prefix], {
    stdio: "ignore",
  });
  const renders = readdirSync(renderDir).filter((name) =>
    name.startsWith(`${id}-`),
  );

  const add = (
    condition: boolean,
    pass: string,
    fail: string,
    severity: "fail" | "warn" = "fail",
  ) => {
    const item: Check = {
      scope: id,
      status: condition ? "pass" : severity,
      message: condition ? pass : fail,
    };
    localChecks.push(item);
    checks.push(item);
  };
  add(info.pages > 0, `${info.pages} PDF page(s) readable`, "PDF has no readable pages");
  add(
    renders.length === info.pages,
    `Rendered all ${renders.length} page(s) with pdftoppm`,
    `Rendered ${renders.length} of ${info.pages} PDF pages`,
  );
  add(
    text.includes(screen.title.replace(/\s+[—-].*$/, "").trim()),
    "PDF contains report title",
    `PDF text does not contain screen title "${screen.title}"`,
  );
  add(
    /Sl\s*No\.?/i.test(text),
    "PDF contains a serial-number column",
    "PDF is missing the Sl No. header",
  );
  add(
    /Page\s+1\s+of\s+\d+/i.test(text),
    "PDF contains Page X of Y footer",
    "PDF is missing an accurate-looking Page X of Y footer",
  );
  add(
    !text.includes("₹") || !text.includes("¹"),
    "PDF text has no obvious mojibake currency sequence",
    "PDF contains an obvious mojibake currency sequence",
    "warn",
  );
  artifacts.push({ id, kind: "pdf", file, screen, checks: localChecks });
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const candidate = value as {
      text?: string;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (candidate.text !== undefined) return String(candidate.text);
    if (candidate.result !== undefined) return String(candidate.result);
    if (candidate.richText) return candidate.richText.map((part) => part.text).join("");
  }
  return String(value);
}

async function validateWorkbook(
  id: string,
  file: string,
  screen: ScreenSnapshot,
  expectedSheets?: string[],
) {
  const excelModule = await import(pathToFileURL(excelEntry).href);
  const ExcelJS = (excelModule.default ?? excelModule) as any;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const localChecks: Check[] = [];
  const add = (
    condition: boolean,
    pass: string,
    fail: string,
    severity: "fail" | "warn" = "fail",
  ) => {
    const item: Check = {
      scope: id,
      status: condition ? "pass" : severity,
      message: condition ? pass : fail,
    };
    localChecks.push(item);
    checks.push(item);
  };

  add(workbook.worksheets.length > 0, "Workbook reopened with ExcelJS", "Workbook has no sheets");
  if (expectedSheets) {
    const actual = workbook.worksheets.map((sheet: any) => sheet.name);
    add(
      expectedSheets.every((name) => actual.includes(name)),
      `Expected worksheets present: ${expectedSheets.join(", ")}`,
      `Worksheet mismatch. Expected ${expectedSheets.join(", ")}; got ${actual.join(", ")}`,
    );
  }

  for (const sheet of workbook.worksheets as any[]) {
    const scope = `${id}/${sheet.name}`;
    let headerRow: any;
    let serialColumn = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber++) {
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= row.cellCount; column++) {
        if (/^sl\s*(no\.?|#)$/i.test(cellText(row.getCell(column).value).trim())) {
          headerRow = row;
          serialColumn = column;
        }
      }
      if (headerRow) break;
    }
    add(!!headerRow, `${sheet.name}: one Sl No. header found`, `${sheet.name}: no Sl No. header found`);
    if (!headerRow) continue;

    const serialHeaders: number[] = [];
    headerRow.eachCell((cell: any, column: number) => {
      if (/^sl\s*(no\.?|#)$/i.test(cellText(cell.value).trim())) serialHeaders.push(column);
    });
    add(
      serialHeaders.length === 1,
      `${sheet.name}: exactly one serial column`,
      `${sheet.name}: ${serialHeaders.length} serial columns (duplicate numbering)`,
    );
    add(
      !!headerRow.getCell(serialColumn).font?.bold &&
        !!headerRow.getCell(serialColumn).fill?.fgColor,
      `${sheet.name}: table header is styled`,
      `${sheet.name}: table header lacks bold/fill styling`,
    );

    const serials: number[] = [];
    for (let rowNumber = headerRow.number + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values = Array.from({ length: headerRow.cellCount }, (_, index) =>
        cellText(row.getCell(index + 1).value).trim(),
      );
      const isTotal = values.some((value) => /^total$/i.test(value));
      const serial = Number(row.getCell(serialColumn).value);
      if (!isTotal && Number.isInteger(serial) && serial > 0) serials.push(serial);
      if (isTotal) {
        add(
          !row.getCell(serialColumn).value,
          `${sheet.name}: totals row is not numbered`,
          `${sheet.name}: totals row incorrectly has a serial number`,
        );
      }
    }
    add(
      serials.every((value, index) => value === index + 1),
      `${sheet.name}: serials are contiguous 1–${serials.length}`,
      `${sheet.name}: serial sequence is ${serials.slice(0, 12).join(", ")}`,
    );
    add(
      !!sheet.views?.some((view: any) => view.state === "frozen"),
      `${sheet.name}: header pane frozen`,
      `${sheet.name}: no frozen header pane`,
    );
    add(
      !!sheet.autoFilter,
      `${sheet.name}: auto-filter configured`,
      `${sheet.name}: auto-filter missing`,
    );
    add(
      sheet.columns.every((column: any) => Number(column.width ?? 0) >= 6),
      `${sheet.name}: practical column widths set`,
      `${sheet.name}: one or more columns are too narrow/unset`,
      "warn",
    );
    add(
      !!sheet.pageSetup?.orientation && !!sheet.pageSetup?.fitToPage,
      `${sheet.name}: print settings configured`,
      `${sheet.name}: print orientation/fit settings incomplete`,
      "warn",
    );

    const firstDataRow = sheet.getRow(headerRow.number + 1);
    const numericCells: unknown[] = [];
    firstDataRow.eachCell((cell: any) => numericCells.push(cell.value));
    const screenHasNumbers = screen.tableRows.flat(2).some((value) => /^\d+$/.test(value));
    add(
      !screenHasNumbers || numericCells.some((value) => typeof value === "number"),
      `${sheet.name}: numeric values remain numeric`,
      `${sheet.name}: screen has numbers but first data row contains no numeric cells`,
      "warn",
    );
    checks.push({
      scope,
      status: "pass",
      message: `${sheet.rowCount} rows, ${sheet.columnCount} columns`,
    });
  }
  artifacts.push({ id, kind: "xlsx", file, screen, checks: localChecks });
}

async function exportPair(
  page: Page,
  id: string,
  expectedSheets?: string[],
) {
  const screen = await snapshotScreen(page);
  const excelFile = await clickDownload(page, "Excel");
  await validateWorkbook(`${id}-excel`, excelFile, screen, expectedSheets);
  const pdfFile = await clickDownload(page, "PDF");
  validatePdf(`${id}-pdf`, pdfFile, screen);
  return { excelFile, pdfFile, screen };
}

async function clickFirstNonZeroLink(
  page: Page,
  tableIndex = 0,
): Promise<string> {
  const selected = await page.evaluate((index) => {
    const table = document.querySelectorAll("table")[index];
    if (!table) return "";
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const row =
      rows.find((candidate) => {
        const values = Array.from(candidate.querySelectorAll("td")).map((cell) =>
          Number((cell.textContent ?? "").trim()),
        );
        return values.slice(2).some((value) => Number.isFinite(value) && value > 0);
      }) ?? rows[0];
    const link = row?.querySelector("a") as HTMLElement | null;
    const text = link?.textContent?.trim() ?? "";
    link?.click();
    return text;
  }, tableIndex);
  if (!selected) throw new Error("No drill-down link was available");
  await sleep(1000);
  return selected;
}

async function selectFirstUsefulOption(page: Page, selector: string) {
  return page.evaluate((target) => {
    const select = document.querySelector(target) as HTMLSelectElement | null;
    if (!select || select.options.length < 2) return "";
    const option = Array.from(select.options).find((item) => item.value) ?? select.options[0];
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return option.text;
  }, selector);
}

async function validateBuilderApis(page: Page) {
  const result = await page.evaluate(async () => {
    const module = await import("/src/lib/reportDownloads.ts");
    const excel = new module.ExcelBuilder("Builder API QA").addSheet({
      name: "Data",
      columns: [{ key: "amount", label: "Amount" }],
      rows: [{ amount: 123 }],
    });
    const workbook = await excel.build();
    const excelBuffer = await excel.toBuffer();
    const rupeePdf = new module.PdfBuilder("Rupee ₹ QA").addSection({
      columns: [{ key: "value", label: "Value" }],
      rows: [{ value: "₹1,234" }],
    });
    const pdfDocument = await rupeePdf.build();
    const pdfBuffer = await rupeePdf.toArrayBuffer();
    let unsupportedError = "";
    try {
      await new module.PdfBuilder("Unsupported glyph QA").addSection({
        columns: [{ key: "value", label: "Value" }],
        rows: [{ value: "Unsupported 🫠" }],
      }).toArrayBuffer();
    } catch (error) {
      unsupportedError = error instanceof Error ? error.message : String(error);
    }
    return {
      worksheetCount: workbook.worksheets.length,
      excelBytes: excelBuffer.byteLength,
      pdfPages: pdfDocument.getNumberOfPages(),
      pdfBytes: pdfBuffer.byteLength,
      unsupportedError,
    };
  });
  check(
    "builder-apis",
    result.worksheetCount === 1 && result.excelBytes > 1000,
    `Excel build()/toBuffer() succeeded (${result.excelBytes} bytes)`,
    `Excel build()/toBuffer() failed: ${JSON.stringify(result)}`,
  );
  check(
    "builder-apis",
    result.pdfPages === 1 && result.pdfBytes > 1000,
    `PDF build()/toArrayBuffer() supports ₹ (${result.pdfBytes} bytes)`,
    `PDF build()/toArrayBuffer() rupee check failed: ${JSON.stringify(result)}`,
  );
  check(
    "builder-apis",
    /does not support.*U\+/i.test(result.unsupportedError),
    `Unsupported PDF character rejected explicitly: ${result.unsupportedError}`,
    `Unsupported PDF character was not explicitly rejected: ${result.unsupportedError || "no error"}`,
  );
}

const syntheticUoiFixture = {
  kpis: {
    totalNotes: 4,
    departmentsCovered: 2,
    occasionsCount: 2,
    locationsCount: 2,
    recentCount: 3,
    firstNoteDate: "2026-08-02T08:00:00.000Z",
    lastNoteDate: "2026-09-20T12:30:00.000Z",
  },
  byDepartment: [
    { name: "Agriculture & Farmers' Emp", count: 3 },
    { name: "Finance", count: 1 },
  ],
  byOccasion: [
    { name: "Synthetic Review", count: 3 },
    { name: "Synthetic Audit", count: 1 },
  ],
  byLocation: [
    { name: "Bhubaneswar", count: 3 },
    { name: "Cuttack", count: 1 },
  ],
  byMonth: [
    { month: "2026-08", count: 1 },
    { month: "2026-09", count: 3 },
  ],
  notes: [
    {
      id: 900004,
      title: "SYNTHETIC QA FIXTURE — A deliberately long UOI note title that verifies wrapped rows receive enough height without clipping any report text",
      date: "2026-09-20",
      departmentId: 1,
      departmentName: "Agriculture & Farmers' Emp",
      occasion: "Synthetic Review",
      location: "Bhubaneswar",
      description: "Browser-only synthetic fixture; no database mutation.",
      createdBy: 1,
      createdAt: "2026-09-20T12:30:00.000Z",
    },
    {
      id: 900003,
      title: "SYNTHETIC QA FIXTURE — Irrigation ₹1,25,000",
      date: "2026-09-15",
      departmentId: 1,
      departmentName: "Agriculture & Farmers' Emp",
      occasion: "Synthetic Review",
      location: "Bhubaneswar",
      description: "Browser-only synthetic fixture; no database mutation.",
      createdBy: 1,
      createdAt: "2026-09-15T09:15:00.000Z",
    },
    {
      id: 900002,
      title: "SYNTHETIC QA FIXTURE — Finance review",
      date: "2026-09-01",
      departmentId: 2,
      departmentName: "Finance",
      occasion: "Synthetic Audit",
      location: "Cuttack",
      description: "Browser-only synthetic fixture; no database mutation.",
      createdBy: 1,
      createdAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: 900001,
      title: "SYNTHETIC QA FIXTURE — Baseline review",
      date: "2026-08-02",
      departmentId: 1,
      departmentName: "Agriculture & Farmers' Emp",
      occasion: "Synthetic Review",
      location: "Bhubaneswar",
      description: "Browser-only synthetic fixture; no database mutation.",
      createdBy: 1,
      createdAt: "2026-08-02T08:00:00.000Z",
    },
  ],
};

async function validateUoiFixtureWorkbook(file: string) {
  const excelModule = await import(pathToFileURL(excelEntry).href);
  const ExcelJS = (excelModule.default ?? excelModule) as any;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const department = workbook.getWorksheet("By Department");
  const notes = workbook.getWorksheet("UOI Notes");
  let departmentHeader = 0;
  let notesHeader = 0;
  for (let row = 1; row <= 30; row++) {
    if (department.getRow(row).values.some((value: unknown) => cellText(value) === "Share")) departmentHeader = row;
    if (notes.getRow(row).values.some((value: unknown) => cellText(value) === "Date")) notesHeader = row;
  }
  const shares = [
    department.getCell(departmentHeader + 1, 4).value,
    department.getCell(departmentHeader + 2, 4).value,
  ];
  check(
    "uoi-synthetic-fixture",
    shares[0] === 0.75 && shares[1] === 0.25 &&
      department.getCell(departmentHeader + 1, 4).numFmt === "0.0%",
    "Synthetic By Department shares are numeric 75%/25% with 0.0% formatting",
    `Synthetic shares are not numeric/formatted correctly: ${JSON.stringify(shares)}`,
  );
  const dateValues = [1, 2, 3, 4].map((offset) =>
    notes.getCell(notesHeader + offset, 4).text,
  );
  check(
    "uoi-synthetic-fixture",
    JSON.stringify(dateValues) === JSON.stringify([
      "20 Sep 2026",
      "15 Sep 2026",
      "01 Sep 2026",
      "02 Aug 2026",
    ]),
    `Synthetic UOI dates exported unambiguously: ${dateValues.join(", ")}`,
    `Synthetic UOI date values were unexpected: ${dateValues.join(", ")}`,
  );
  const longRow = notes.getRow(notesHeader + 1);
  check(
    "uoi-synthetic-fixture",
    Number(longRow.height ?? 0) > 20 && !!longRow.getCell(2).alignment?.wrapText,
    `Long synthetic title row wrapped at height ${longRow.height}`,
    `Long synthetic title row height/wrapping insufficient: height=${longRow.height}`,
  );
}

async function runTargetedChecks(page: Page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/uoi-notes/report"
    ) {
      void request.respond({
        status: 200,
        contentType: "application/json",
        headers: { "x-qa-fixture": "synthetic-browser-only" },
        body: JSON.stringify(syntheticUoiFixture),
      });
    } else {
      void request.continue();
    }
  });

  await spaGoto(page, "/reports/uoi-notes");
  const uoi = await exportPair(page, "uoi-synthetic-fixture", [
    "UOI Notes",
    "Summary",
    "By Department",
    "By Occasion",
    "By Location",
    "By Month",
  ]);
  await validateUoiFixtureWorkbook(uoi.excelFile);
  const uoiText = readFileSync(
    resolve(textDir, "uoi-synthetic-fixture-pdf.txt"),
    "utf8",
  );
  check(
    "uoi-synthetic-fixture",
    [
      "UOI Notes",
      "Summary",
      "By Department",
      "By Occasion",
      "By Location",
      "By Month",
      "75.0%",
      "20 Sep 2026",
      "SYNTHETIC QA FIXTURE",
    ].every((value) => uoiText.includes(value)),
    "Synthetic PDF contains all six sections, percentage, formatted date, and fixture label",
    "Synthetic PDF is missing an expected section/value/fixture label",
  );

  await spaGoto(page, "/reports/aging-analysis");
  const selected = await page.evaluate(() => {
    const selects = document.querySelectorAll("select");
    const bucket = selects[2] as HTMLSelectElement | undefined;
    if (!bucket) return "";
    bucket.value = "3";
    bucket.dispatchEvent(new Event("change", { bubbles: true }));
    return bucket.options[bucket.selectedIndex]?.text ?? "";
  });
  await sleep(700);
  check(
    "ageing-bucket-metadata",
    selected === "60+ days",
    "Selected 60+ days bucket in real UI",
    `Could not select expected ageing bucket; selected "${selected}"`,
  );
  const ageing = await exportPair(page, "ageing-selected-bucket", [
    "Department Breakdown",
    "Detailed Aging",
  ]);
  const ageingText = readFileSync(
    resolve(textDir, "ageing-selected-bucket-pdf.txt"),
    "utf8",
  );
  check(
    "ageing-bucket-metadata",
    ageingText.includes("Age Bucket (Detailed Aging only): 60+ days") &&
      ageingText.includes("Department Breakdown: All age buckets"),
    "Selected-bucket scope is explicit in PDF metadata",
    "PDF does not distinguish detailed bucket filter from all-bucket breakdown",
  );
  const excelModule = await import(pathToFileURL(excelEntry).href);
  const ExcelJS = (excelModule.default ?? excelModule) as any;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(ageing.excelFile);
  for (const sheet of workbook.worksheets as any[]) {
    const metadata = Array.from({ length: Math.min(12, sheet.rowCount) }, (_, index) =>
      sheet.getCell(index + 1, 1).text,
    ).join(" ");
    check(
      `ageing-bucket-metadata/${sheet.name}`,
      metadata.includes("Age Bucket (Detailed Aging only): 60+ days") &&
        metadata.includes("Department Breakdown: All age buckets"),
      `${sheet.name} carries explicit selected-bucket scope metadata`,
      `${sheet.name} is missing explicit selected-bucket scope metadata`,
    );
  }
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: chromium,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    const cdp = await page.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
    await loginReadOnly(page);

    // Start error collection after the expected unauthenticated /auth/me probe
    // on the public login page has completed.
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) =>
      browserErrors.push(
        `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      ),
    );
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/api/")) {
        browserErrors.push(`http ${response.status()}: ${response.url()}`);
      }
    });
    await validateBuilderApis(page);
    if (targetedOnly) {
      await runTargetedChecks(page);
      return;
    }

    await spaGoto(page, "/reports/location-wise");
    await exportPair(page, "location-summary", ["Districts"]);
    await clickFirstNonZeroLink(page);
    await exportPair(page, "location-block-summary", ["Blocks"]);
    await clickFirstNonZeroLink(page);
    await exportPair(page, "location-detail", ["All"]);

    await spaGoto(page, "/reports/department-wise");
    await exportPair(page, "department-summary", ["Departments"]);
    await clickFirstNonZeroLink(page);
    await exportPair(page, "department-detail", ["All"]);

    await spaGoto(page, "/reports/announcement-progress");
    const filterName = await selectFirstUsefulOption(page, "select");
    await sleep(900);
    check(
      "progress-filter",
      !!filterName,
      `Applied active department filter: ${filterName}`,
      "Could not apply a department filter",
      "warn",
    );
    await exportPair(page, "announcement-progress", ["Announcements"]);

    await spaGoto(page, "/reports/occasion-wise");
    await exportPair(page, "occasion-summary", ["Occasions"]);
    await clickFirstNonZeroLink(page);
    await exportPair(page, "occasion-detail", ["Announcements"]);

    await spaGoto(page, "/reports/aging-analysis");
    await exportPair(page, "ageing", ["Department Breakdown", "Detailed Aging"]);

    await spaGoto(page, "/reports/uoi-notes");
    try {
      await exportPair(page, "uoi", [
        "UOI Notes",
        "Summary",
        "By Department",
        "By Occasion",
        "By Location",
        "By Month",
      ]);
    } catch (error) {
      const screen = await snapshotScreen(page);
      checks.push({
        scope: "uoi",
        status: "fail",
        message: `UOI exports unavailable: ${
          error instanceof Error ? error.message : String(error)
        }. Screen state: ${screen.bodySummary.slice(0, 500)}`,
      });
    }

    await spaGoto(page, "/announcements");
    await page.evaluate(() => {
      const columns = Array.from(document.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Columns"),
      ) as HTMLButtonElement | undefined;
      columns?.click();
    });
    await sleep(250);
    const selection = await page.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll(".col-picker-dropdown input[type=checkbox]"),
      ) as HTMLInputElement[];
      let changed = 0;
      for (const checkbox of checkboxes) {
        if (!checkbox.disabled && checkbox.checked && changed < 2) {
          checkbox.click();
          changed++;
        }
      }
      return {
        changed,
        selected: Array.from(
          document.querySelectorAll(".col-picker-dropdown input[type=checkbox]:checked"),
        ).length,
      };
    });
    check(
      "hcm-selected-columns",
      selection.changed > 0,
      `Changed selection; ${selection.selected} optional columns remain`,
      "Could not change HCM selected columns",
    );
    const hcmScreen = await snapshotScreen(page);
    const before = filesInDownloads();
    await page.evaluate(() => {
      const download = Array.from(document.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Download"),
      ) as HTMLButtonElement | undefined;
      download?.click();
    });
    const hcmFile = await waitForNewDownload(before);
    await validateWorkbook("hcm-selected-columns", hcmFile, hcmScreen, ["Announcements"]);
  } finally {
    await browser.close();
  }
}

function writeReport(runError?: unknown) {
  if (runError) {
    checks.push({
      scope: "harness",
      status: "fail",
      message: runError instanceof Error ? runError.stack ?? runError.message : String(runError),
    });
  }
  const uniqueBrowserErrors = [...new Set(browserErrors)];
  checks.push({
    scope: "browser",
    status: uniqueBrowserErrors.length ? "fail" : "pass",
    message: uniqueBrowserErrors.length
      ? `${uniqueBrowserErrors.length} browser/API error(s) captured`
      : "No browser console, page, failed-request, or API HTTP errors captured",
  });
  const report = {
    task: 276,
    generatedAt: new Date().toISOString(),
    outputRoot,
    coverage,
    summary: {
      pass: checks.filter((item) => item.status === "pass").length,
      fail: checks.filter((item) => item.status === "fail").length,
      warn: checks.filter((item) => item.status === "warn").length,
      downloads: artifacts.length,
    },
    browserErrors: uniqueBrowserErrors,
    checks,
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      file: artifact.file ? basename(artifact.file) : undefined,
    })),
  };
  writeFileSync(resolve(outputRoot, "qa-report.json"), JSON.stringify(report, null, 2));
  const lines = [
    "# Task #276 report export QA",
    "",
    `Generated: ${report.generatedAt}`,
    `Result: ${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.warn} warnings`,
    `Artifacts checked: ${report.summary.downloads}`,
    "",
    "## Failures and warnings",
    ...checks
      .filter((item) => item.status !== "pass")
      .map((item) => `- **${item.status.toUpperCase()}** ${item.scope}: ${item.message}`),
    "",
    "## Browser errors",
    ...(uniqueBrowserErrors.length
      ? uniqueBrowserErrors.map((error) => `- ${error}`)
      : ["- None"]),
    "",
    "See qa-report.json for all checks and per-artifact screen snapshots.",
  ];
  writeFileSync(resolve(outputRoot, "qa-report.md"), lines.join("\n"));
  console.log(`QA output: ${outputRoot}`);
  console.log(
    `${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.warn} warnings`,
  );
  return report.summary.fail;
}

let runError: unknown;
try {
  await run();
} catch (error) {
  runError = error;
} finally {
  const failures = writeReport(runError);
  process.exitCode = failures ? 1 : 0;
}