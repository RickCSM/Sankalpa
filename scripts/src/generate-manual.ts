import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PageBreak,
  TableOfContents,
  StyleLevel,
  UnderlineType,
  ImageRun,
} from "docx";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, "../../UserManual.docx");
const SCREENSHOTS_DIR = resolve(__dirname, "../screenshots");

// ─── Colour palette ────────────────────────────────────────────────────────
const NAVY = "1A3A5C";
const ORANGE = "E87722";
const AMBER = "D97706";
const TEAL = "0F766E";
const GREEN = "166534";
const RED = "991B1B";
const GREY_BG = "F3F4F6";
const WHITE = "FFFFFF";
const LIGHT_NAVY = "EBF2FA";

// ─── Typography helpers ─────────────────────────────────────────────────────
const bold = (text: string, size = 22, color = "000000") =>
  new TextRun({ text, bold: true, size, color });

const normal = (text: string, size = 22, color = "000000") =>
  new TextRun({ text, size, color });

const colored = (text: string, color: string, size = 22, isBold = false) =>
  new TextRun({ text, bold: isBold, size, color });

// ─── Paragraph helpers ──────────────────────────────────────────────────────
function heading1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 36, color: NAVY })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: NAVY })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 160 },
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: ORANGE })],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
  });
}

function para(text: string, size = 22): Paragraph {
  return new Paragraph({
    children: [normal(text, size)],
    spacing: { after: 120 },
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    children: [normal(text, 22)],
    bullet: { level },
    spacing: { after: 80 },
  });
}

function numbered(text: string, level = 0): Paragraph {
  return new Paragraph({
    children: [normal(text, 22)],
    numbering: { reference: "numbered-list", level },
    spacing: { after: 80 },
  });
}

function note(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "Note: ", bold: true, size: 20, color: AMBER }),
      new TextRun({ text, size: 20, color: "4B5563" }),
    ],
    spacing: { before: 80, after: 120 },
    indent: { left: 360 },
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 200 } });
}

// ─── Screenshot helpers ──────────────────────────────────────────────────────
// Screenshots are 1280×720; displayed at 580×326 px in the document.
const SCREENSHOT_W = 580;
const SCREENSHOT_H = Math.round(SCREENSHOT_W * (720 / 1280));

function screenshotPara(filename: string): Paragraph | null {
  const filePath = resolve(SCREENSHOTS_DIR, filename);
  if (!existsSync(filePath)) {
    console.warn(`  ⚠️  screenshot missing, skipping: ${filename}`);
    return null;
  }
  const data = readFileSync(filePath);
  return new Paragraph({
    children: [
      new ImageRun({
        type: "png",
        data,
        transformation: { width: SCREENSHOT_W, height: SCREENSHOT_H },
        altText: { title: filename, description: filename, name: filename },
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 80 },
  });
}

function captionPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, size: 18, color: "6B7280" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  });
}

function screenshot(filename: string, caption: string): Paragraph[] {
  return [screenshotPara(filename), captionPara(caption)].filter(
    (x): x is Paragraph => x !== null
  );
}

// ─── Table helpers ──────────────────────────────────────────────────────────
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
};

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20, color: WHITE })],
        alignment: AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
      }),
    ],
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, fill: NAVY },
    borders: cellBorders,
  });
}

function dataCell(text: string, widthPct: number, shade = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [normal(text, 20)],
        spacing: { before: 60, after: 60 },
      }),
    ],
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: shade ? { type: ShadingType.SOLID, fill: LIGHT_NAVY } : undefined,
    borders: cellBorders,
  });
}

function simpleTable(headers: string[], rows: string[][], widths?: number[]): Table {
  const total = 100;
  const w = widths ?? headers.map(() => total / headers.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map((h, i) => headerCell(h, w[i]!)),
        tableHeader: true,
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: row.map((cell, i) => dataCell(cell, w[i]!, ri % 2 === 1)),
        })
      ),
    ],
  });
}

// ─── Section: Cover / Title ─────────────────────────────────────────────────
function coverSection(): (Paragraph | TableOfContents)[] {
  return [
    spacer(),
    new Paragraph({
      children: [new TextRun({ text: "Sankalpa Odisha", bold: true, size: 64, color: NAVY })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "User Manual", bold: true, size: 48, color: ORANGE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Government of Odisha", size: 28, color: "6B7280" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Sarkari Pratishruti Pratipalan", italics: true, size: 24, color: "6B7280" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Ensuring, analysing, and monitoring the fulfilment of government promises", size: 22, color: "9CA3AF" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    pageBreak(),
    new Paragraph({
      children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: NAVY })],
      spacing: { before: 200, after: 200 },
    }),
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
      stylesWithLevels: [
        new StyleLevel("Heading1", 1),
        new StyleLevel("Heading2", 2),
        new StyleLevel("Heading3", 3),
      ],
    }),
    pageBreak(),
  ];
}

// ─── Section 1: About this Manual ──────────────────────────────────────────
function aboutSection(): (Paragraph | Table)[] {
  return [
    heading1("1. About this Manual"),
    para(
      "This document is a comprehensive reference guide for all users of the Sankalpa Odisha portal. " +
      "It covers every module, workflow, and user role in the system. " +
      "Use the Table of Contents to navigate to the section relevant to your role."
    ),
    para(
      "The portal tracks the complete lifecycle of HCM (Honourable Chief Minister) Announcements — " +
      "from creation by the CMO Nodal Officer, through review and publication, to execution by departments, " +
      "and final completion verified by the CMO Reviewer."
    ),
    heading2("1.1 Demo Accounts"),
    para("The following bootstrap accounts are available in development environments:"),
    spacer(),
    simpleTable(
      ["Role", "Username", "Default Password"],
      [
        ["System Administrator", "admin", "Admin@123"],
        ["Chief Minister", "cm", "Cm@123"],
        ["CMO Nodal Officer", "cmo_nodal", "Cmo@123"],
        ["CMO Reviewer", "cmo_reviewer", "Cmo@123"],
        ["Department Head", "dept_head", "Dept@123"],
        ["Department Nodal Officer", "dept_nodal", "Dept@123"],
        ["Department Reviewer", "dept_reviewer", "Dept@123"],
        ["Department User", "dept_user", "Dept@123"],
      ],
      [30, 25, 45]
    ),
    spacer(),
    note(
      "On first login with a default password the system forces an immediate password change. " +
      "No other pages can be accessed until the password is updated."
    ),
    pageBreak(),
  ];
}

// ─── Section 2: Getting Started ─────────────────────────────────────────────
function gettingStartedSection(): (Paragraph | Table)[] {
  return [
    heading1("2. Getting Started"),
    heading2("2.1 Sign-In"),
    para(
      "Open the Sankalpa Odisha portal in your browser. You will be greeted by the Sign-In page."
    ),
    ...screenshot("login.png", "Figure 1 — Sign-In page"),
    bullet("Enter your assigned Username and Password."),
    bullet("Type the characters shown in the captcha image exactly as displayed (case-sensitive). Click the refresh icon if the image is hard to read."),
    bullet("Click Sign In to access your role-specific dashboard."),
    spacer(),
    heading2("2.2 First-Login Password Change"),
    para(
      "If you are logging in for the first time with a system-issued or default password, " +
      "you will be automatically redirected to the Change Password page. " +
      "You must set a new password before you can access any other part of the portal."
    ),
    bullet("Enter your current password."),
    bullet("Enter a new password that meets the complexity requirements."),
    bullet("Confirm the new password."),
    bullet("Click Change Password. You will be returned to your dashboard on success."),
    spacer(),
    note("The portal will continue to redirect you to this page on every login until the default password is changed."),
    spacer(),
    heading2("2.3 Changing Your Password (Routine)"),
    para("At any time you can update your password from the Change Password page (/change-password):"),
    bullet("Click your profile / account menu and choose Change Password, or navigate directly to the page."),
    bullet("Enter your current password, then enter and confirm a new password."),
    bullet("Click Change Password to save."),
    pageBreak(),
  ];
}

// ─── Section 3: User Roles and Permissions ──────────────────────────────────
function rolesSection(): (Paragraph | Table)[] {
  return [
    heading1("3. User Roles and Permissions"),
    para(
      "The portal supports eight user roles, each with a distinct scope and set of capabilities. " +
      "System-wide roles can see all departments; Department roles are scoped to a single department."
    ),
    spacer(),
    simpleTable(
      ["Role", "Scope", "Key Capabilities"],
      [
        [
          "Administrator",
          "System-wide",
          "Full access: manage users, departments, tags, activity logs. Can perform any workflow action on any announcement.",
        ],
        [
          "Chief Minister",
          "System-wide",
          "Read-only: high-level dashboards, all reports, all non-draft announcements. Cannot create or action announcements.",
        ],
        [
          "CMO Nodal Officer",
          "System-wide",
          "Create and edit HCM Announcements; track workflow status; view all reports.",
        ],
        [
          "CMO Reviewer",
          "System-wide",
          "Approve or revert new announcements (Publish/Revert); approve or revert final completion claims.",
        ],
        [
          "Department Head",
          "Department",
          "Read-only view of their department's announcements and dashboard. Cannot take workflow actions.",
        ],
        [
          "Department Nodal Officer",
          "Department",
          "Accept published announcements; add and manage sub-components; mark completion.",
        ],
        [
          "Department Reviewer",
          "Department",
          "Review completion claims from Dept. Nodal; approve or revert before escalating to CMO.",
        ],
        [
          "Department User",
          "Department",
          "General read access within their department. Cannot take workflow actions.",
        ],
      ],
      [20, 15, 65]
    ),
    spacer(),
    heading2("3.1 Permission Reference"),
    spacer(),
    simpleTable(
      ["Permission", "Roles Granted"],
      [
        ["Create / edit announcements", "CMO Nodal"],
        ["CMO initial review (Approve/Revert)", "Admin, CMO Reviewer"],
        ["Accept announcement (Dept Nodal step)", "Admin, Dept Nodal"],
        ["Final accept (Dept Reviewer step)", "Admin, Dept Reviewer"],
        ["Add sub-components", "Admin, Dept Nodal"],
        ["Request completion review", "Admin, Dept Nodal"],
        ["Review completion (Dept Reviewer)", "Admin, Dept Reviewer"],
        ["CMO final completion review", "Admin, CMO Reviewer"],
        ["Manage all users", "Admin"],
        ["Create dept users (within dept)", "Admin, Dept Nodal"],
        ["View audit log", "Admin, Dept Nodal"],
        ["View reports", "Admin, Chief Minister, CMO Nodal, CMO Reviewer"],
        ["View UOI Notes", "Admin, Chief Minister, CMO Nodal, CMO Reviewer"],
        ["Delete UOI Notes", "Admin only"],
      ],
      [40, 60]
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 4: Dashboard ───────────────────────────────────────────────────
function dashboardSection(): (Paragraph | Table)[] {
  return [
    heading1("4. Dashboard"),
    para(
      "After login, every user (except Admin, who lands on User Management) is taken to their role-specific dashboard. " +
      "The dashboard surfaces real-time KPIs, charts, and action queues relevant to the signed-in role."
    ),
    ...screenshot("dashboard.png", "Figure 2 — Administrator Dashboard"),
    heading2("4.1 Common Elements"),
    bullet("Status Cards — Five counters across the top: Total, Completed, In-Review, In Progress, and Not Started. Each card is a link to a pre-filtered announcement list."),
    bullet("HCM Announcement Status Chart — A donut chart showing the proportional split across all workflow statuses."),
    bullet("Department Progress Table — A drill-down table: Department → District → Block, showing completion percentages at each level."),
    bullet("Notifications Panel — Click the bell icon in the header to see workflow events addressed to you (reverts, approvals, assignments)."),
    spacer(),
    heading2("4.2 Role-Specific Portlets"),
    spacer(),
    simpleTable(
      ["Role", "Additional Dashboard Portlets"],
      [
        ["Administrator", "System Overview (user counts by role and status); Recent Activity Feed."],
        ["Chief Minister", "Key Highlights; Recent Completions feed."],
        ["CMO Nodal Officer", "My Created Announcements (status of items I authored)."],
        ["CMO Reviewer", "Pending Review Queue; Pending CMO Completion Reviews; Recently Reviewed."],
        ["Dept. Head", "Department Team panel (who are the nodal officers and reviewers)."],
        ["Dept. Nodal Officer", "My Pending Actions; My Sub-Components."],
        ["Dept. Reviewer", "Pending Completion Review queue."],
      ],
      [25, 75]
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 5: Announcements ───────────────────────────────────────────────
function announcementsSection(): (Paragraph | Table)[] {
  return [
    heading1("5. HCM Announcements"),
    para(
      "The Announcements module is the core of the portal. It manages the full lifecycle of every " +
      "commitment made by the Honourable Chief Minister — from initial entry to final verified completion."
    ),

    heading2("5.1 Announcement Lifecycle"),
    para("Each announcement moves through up to 11 workflow statuses:"),
    spacer(),
    simpleTable(
      ["#", "Status (code)", "Meaning", "Who Acts Next"],
      [
        ["1", "Draft", "Created by CMO Nodal; not yet submitted for review. Visible only to the creator.", "CMO Nodal — Submit"],
        ["2", "Pending CMO Review", "Submitted and awaiting the CMO Reviewer's decision.", "CMO Reviewer — Approve or Revert"],
        ["3", "Reverted by CMO", "Sent back to the creator with comments. Creator must edit and resubmit.", "CMO Nodal — Edit & Resubmit"],
        ["4", "Published", "Approved by CMO Reviewer. Assigned to the target department.", "Dept. Nodal — Accept & Forward"],
        ["5", "Pending Final Acceptance\n(pending_dept_acceptance)", "Dept. Nodal has forwarded to the Dept. Reviewer for a mandatory final acceptance step before work begins.", "Dept. Reviewer — Grant Final Acceptance"],
        ["6", "Accepted", "Dept. Reviewer has granted final acceptance. Work can now begin.", "Dept. Nodal — Start Progress"],
        ["7", "In Progress", "Work actively underway. Sub-components can be created and updated.", "Dept. Nodal — Add sub-components, Request Completion"],
        ["8", "Pending Completion Review", "Dept. Nodal has claimed completion; awaiting Dept. Reviewer sign-off.", "Dept. Reviewer — Approve or Revert"],
        ["9", "Reverted by Dept. Reviewer", "Sent back to Dept. Nodal for rework.", "Dept. Nodal — Rework, Resubmit"],
        ["10", "Pending CMO Completion Review", "Dept. Reviewer approved; awaiting CMO Reviewer final sign-off.", "CMO Reviewer — Approve Completion or Revert"],
        ["11", "Completed", "Fully signed off. Terminal state.", "—"],
      ],
      [5, 27, 43, 25]
    ),
    spacer(),

    heading2("5.2 Announcements List Page"),
    para("Accessible via the Announcements menu item. Shows all announcements visible to the signed-in role."),
    ...screenshot("announcements.png", "Figure 3 — Announcements List"),
    bullet("Search bar — full-text search across announcement titles and descriptions."),
    bullet("Filters panel (click Filters button) — filter by Status, Department, District, Date From/To. Department roles see only their own department's announcements."),
    bullet("Column picker — toggle optional columns: Unique ID, Title, Date, Department, Occasion, Location, District, Category, Created By, Status."),
    bullet("Sortable columns — click any column header to sort ascending/descending."),
    bullet("Page size selector — 25, 50, 100, or 200 records per page."),
    bullet("Click any row to open the Announcement Detail page."),
    ...screenshot("announcement-detail.png", "Figure 4 — Announcement Detail page"),
    spacer(),

    heading2("5.3 Creating an Announcement (CMO Nodal)"),
    para("Click Add HCM Announcement from the Announcements list or the dashboard Quick Actions."),
    numbered("Fill in the Title (required)."),
    numbered("Enter the Announcement Date (required)."),
    numbered("Select the target Department (required)."),
    numbered("Enter the Occasion — the public event at which the commitment was made (required)."),
    numbered("Enter the Location — the venue or geographic area (required)."),
    numbered("Write a Description (required)."),
    numbered("Optionally add: District, Block, Category, Tags, and file Attachments."),
    numbered("Click Submit to send the announcement into Pending CMO Review status."),
    spacer(),
    note("Saving as Draft (without submitting) keeps the announcement private to the creator."),
    spacer(),

    heading2("5.4 CMO Review (CMO Reviewer)"),
    para("When an announcement reaches Pending CMO Review, the assigned CMO Reviewer is notified."),
    numbered("Open the announcement from My Actions or the Pending Review Queue on the dashboard."),
    numbered("Read the details and any attachments."),
    numbered("Optionally enter review comments."),
    numbered("Click Approve & Publish to advance to Published, OR click Revert to send it back to the creator (a comment is required when reverting)."),
    spacer(),
    note("CMO Reviewers are assigned by a round-robin mechanism. A reviewer can only action announcements assigned to them; Admin can override."),
    spacer(),

    heading2("5.5 Department Acceptance (Dept. Nodal → Dept. Reviewer)"),
    para(
      "Once Published, the Dept. Nodal Officer for the assigned department is notified. " +
      "Acceptance is a two-step process involving both the Dept. Nodal and the Dept. Reviewer."
    ),
    numbered("Dept. Nodal opens the announcement from My Actions or the announcement list."),
    numbered("Dept. Nodal clicks Accept & Forward. Status moves to Pending Final Acceptance (pending_dept_acceptance), and the Dept. Reviewer is notified."),
    numbered("Dept. Reviewer opens the announcement and clicks Grant Final Acceptance. Status moves to Accepted."),
    numbered("Dept. Nodal (or the system) then marks Start Progress, moving the status to In Progress. Sub-components can now be added."),
    spacer(),

    heading2("5.6 Sub-Components"),
    para(
      "Sub-components are granular tasks within an announcement. They are managed by the Dept. Nodal Officer " +
      "once the announcement is Accepted or In Progress."
    ),
    bullet("Click Add Sub-Component on the Announcement Detail page."),
    bullet("Provide a Title, Description (optional), and optionally assign the sub-component to a specific user in the department."),
    bullet("Sub-component statuses: Pending → In Progress → Completed."),
    bullet("Only the assigned user (or Admin) can update the status of a sub-component."),
    bullet("All sub-components must be Completed before the Dept. Nodal can request closure."),
    spacer(),

    heading2("5.7 Completion Flow"),
    numbered("Once all sub-components are Completed, the originally-accepting Dept. Nodal clicks Request Completion Review."),
    numbered("The Dept. Reviewer reviews the work. They can Approve Completion (moves to Pending CMO Completion Review) or Revert with comments."),
    numbered("The CMO Reviewer performs the final review. They can Approve Completion (moves to Completed) or Revert."),
    spacer(),

    heading2("5.8 Edit & Resubmit"),
    para("An announcement can be edited by its creator when it is in Draft or Reverted by CMO status. The Dept. Nodal who accepted can edit it when it is in Reverted by Dept. Reviewer status."),
    numbered("Open the announcement and click Edit & Resubmit."),
    numbered("Make corrections to the form fields or attachments."),
    numbered("Click Submit to re-enter the review queue."),
    spacer(),

    heading2("5.9 Attachments"),
    para("Attachments can be uploaded by the announcement creator, the assigned Dept. Nodal, or Admin at any active workflow stage."),
    bullet("Supported formats: PDF, Word documents, images (JPEG, PNG, etc.)."),
    bullet("Click Upload Attachment on the Announcement Detail page."),
    bullet("The uploader or Admin can delete their own attachments."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 6: My Actions ──────────────────────────────────────────────────
function myActionsSection(): (Paragraph | Table)[] {
  return [
    heading1("6. My Actions"),
    para(
      "The My Actions page (/my-actions) consolidates every announcement requiring your immediate attention into a single queue. " +
      "It is the fastest way to find and action pending work without searching through the full announcement list."
    ),
    ...screenshot("my-actions.png", "Figure 5 — My Actions queue"),
    bullet("Tabs group items by workflow stage (e.g., Published — awaiting acceptance; Accepted; In Progress; Reverted by Reviewer)."),
    bullet("Each row shows the announcement title, department, date, and current status."),
    bullet("Click any row to open the Announcement Detail page and take the next action."),
    spacer(),
    simpleTable(
      ["Role", "Items shown in My Actions"],
      [
        ["CMO Nodal", "Drafts; announcements Reverted by CMO that need editing and resubmission."],
        ["CMO Reviewer", "Announcements in Pending CMO Review; announcements in Pending CMO Completion Review."],
        ["Dept. Nodal", "Published announcements awaiting acceptance; Accepted items; In Progress items; Reverted by Reviewer items."],
        ["Dept. Reviewer", "Announcements in Pending Completion Review for their department."],
        ["Admin", "All actionable items across all departments."],
      ],
      [20, 80]
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 7: Reports ─────────────────────────────────────────────────────
function reportsSection(): (Paragraph | Table)[] {
  return [
    heading1("7. Reports"),
    para(
      "The Reports module is available to Admin, Chief Minister, CMO Nodal, and CMO Reviewer roles. " +
      "All reports support filtering and are paginated. Seven types of report are available."
    ),
    ...screenshot("reports.png", "Figure 6 — Letter Count Report"),
    spacer(),
    simpleTable(
      ["#", "Report", "Path", "What it Shows"],
      [
        ["1", "Letter Count Report", "/reports/letter-count", "Counts of announcements aggregated by category / letter type, with quick KPIs and date-range filtering."],
        ["2", "Location-Wise Report", "/reports/location-wise", "Geographic distribution of announcements grouped by District and Block across Odisha. Click a district to drill down to its blocks."],
        ["3", "Department-Wise Report", "/reports/department-wise", "Cross-department comparison of announcement counts and completion rates across all departments."],
        ["4", "Department Detail Report", "/reports/department-wise/:dept", "Drill-down view for a single department, showing district and block-level breakdown. Accessed by clicking a department row in the Department-Wise Report."],
        ["5", "Announcement Progress Report", "/reports/announcement-progress", "Workflow status distribution for every announcement — useful for portfolio-level oversight. Filterable by status group, department, and date."],
        ["6", "Occasion-Wise Report", "/reports/occasion-wise", "Aggregation of announcements by the public occasion or event at which the HCM made the commitment. Useful for measuring impact per engagement."],
        ["7", "Aging Analysis Report", "/reports/aging-analysis", "Time-in-status analysis. Announcements are bucketed by how long they have remained in their current status: 0–7 days, 8–15, 16–30, 31–60, and 60+ days. Helps identify bottlenecks."],
      ],
      [5, 20, 25, 50]
    ),
    spacer(),
    heading2("7.1 Using a Report"),
    numbered("Navigate to the report from the Reports menu."),
    numbered("Apply any available filters (date range, department, status)."),
    numbered("Review the summary cards and table / chart views."),
    numbered("Click drill-down links where available to open sub-reports."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 8: UOI Notes ───────────────────────────────────────────────────
function uoiNotesSection(): (Paragraph | Table)[] {
  return [
    heading1("8. UOI Notes"),
    para(
      "The UOI Notes (Unofficial Issue Notes) module allows CMO-level users to record and track " +
      "notes linked to departments, occasions, and locations. Unlike announcements, UOI Notes have " +
      "no approval workflow — they are immediately visible to all authorised users on submission."
    ),
    ...screenshot("uoi-notes.png", "Figure 7 — UOI Notes list"),

    heading2("8.1 Access"),
    para("The UOI Notes module (/uoi-notes) is accessible to the following roles:"),
    bullet("System Administrator (full access including delete)"),
    bullet("Chief Minister (view and create)"),
    bullet("CMO Nodal Officer (view and create)"),
    bullet("CMO Reviewer (view and create)"),
    spacer(),
    note("Department-level roles (Dept. Head, Dept. Nodal, Dept. Reviewer, Dept. User) cannot access this module."),
    spacer(),

    heading2("8.2 Note Fields"),
    spacer(),
    simpleTable(
      ["Field", "Required", "Description"],
      [
        ["Title", "Yes", "A short, descriptive heading for the note."],
        ["Date", "Yes", "The date associated with the note (date picker)."],
        ["Department", "Yes", "The department to which the note relates. Select from the full department list."],
        ["Description", "Yes", "The full text of the note."],
        ["Occasion", "No", "The public event or occasion context (e.g., Independence Day)."],
        ["Location", "No", "A geographical or venue reference."],
      ],
      [20, 12, 68]
    ),
    spacer(),

    heading2("8.3 Creating a UOI Note"),
    numbered("Click Add HCM UOI Notes at the top right of the UOI Notes page."),
    numbered("Fill in the Title, Date, and Department (all required)."),
    numbered("Write the Description."),
    numbered("Optionally enter Occasion and Location."),
    numbered("Click Submit. The note appears immediately in the list."),
    spacer(),

    heading2("8.4 Searching and Filtering"),
    bullet("Use the Search by Title field to find notes by keyword. Press Enter or click Search."),
    bullet("Use the Filter by Department dropdown to narrow the list to a single department."),
    bullet("Results are paginated (20 records per page by default). Use Prev / Next to navigate."),
    spacer(),

    heading2("8.5 Deleting a UOI Note (Admin Only)"),
    numbered("Locate the note in the list."),
    numbered("Click the trash icon in the Action column."),
    numbered("A confirmation prompt appears — click Confirm to permanently delete, or Cancel to abort."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 9: User Management ─────────────────────────────────────────────
function userManagementSection(): (Paragraph | Table)[] {
  return [
    heading1("9. User Management"),
    para(
      "The User Management page (/users) allows authorised users to create, edit, deactivate, and reset passwords for portal accounts."
    ),
    ...screenshot("user-management.png", "Figure 8 — User Management page"),

    heading2("9.1 Who Can Manage Users"),
    spacer(),
    simpleTable(
      ["Role", "What they can do"],
      [
        ["Administrator", "Create/edit/delete any user; assign any role; reset any password."],
        ["Dept. Nodal Officer", "Create/edit Dept. Reviewer and Dept. User accounts within their own department only. Can deactivate/reactivate (not delete) those accounts."],
      ],
      [25, 75]
    ),
    spacer(),

    heading2("9.2 User Fields"),
    spacer(),
    simpleTable(
      ["Field", "Required", "Notes"],
      [
        ["Full Name", "Yes", "Display name shown throughout the portal."],
        ["Email", "Yes", "Must be a valid email address."],
        ["Username", "Yes", "Unique login identifier. Cannot be changed after creation."],
        ["Password", "Yes (create only)", "Set during creation. Use Reset Password to change later."],
        ["Role", "Yes", "One of the eight roles. Dept. Nodal can only assign Dept. Reviewer or Dept. User."],
        ["Department", "Conditional", "Required for all department-scoped roles."],
        ["Mobile Number", "No", "10-digit mobile number."],
      ],
      [20, 15, 65]
    ),
    spacer(),

    heading2("9.3 Adding a User"),
    numbered("Click Add User."),
    numbered("Fill in Name, Email, Username, Password, Role, and (if applicable) Department."),
    numbered("Click Add User to save."),
    spacer(),

    heading2("9.4 Editing a User"),
    numbered("Click the edit (pencil) icon on the user row."),
    numbered("Update Name, Email, Role, Department, or Mobile. Username cannot be edited."),
    numbered("Click Update User to save."),
    spacer(),
    note("Passwords cannot be edited here. Use the Reset Password button to issue a new password."),
    spacer(),

    heading2("9.5 Resetting a Password"),
    numbered("Click the key icon on the user row."),
    numbered("Enter and confirm the new password in the modal."),
    numbered("Click Reset Password. The user will be prompted to change it on next login."),
    spacer(),

    heading2("9.6 Deactivating / Reactivating a User"),
    para("Admins can permanently delete a user; Dept. Nodal Officers can only deactivate or reactivate."),
    bullet("Click the person-x icon to deactivate (the user cannot log in while Inactive)."),
    bullet("Click the person-check icon to reactivate."),
    spacer(),

    heading2("9.7 Procedure Guide"),
    para(
      "The Users page includes a built-in Procedure Guide (click the Procedure Guide button in the header). " +
      "It provides a step-by-step walkthrough for common user-management tasks, including creating a Dept. User and resetting passwords."
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 10: User Tagging ───────────────────────────────────────────────
function userTaggingSection(): (Paragraph | Table)[] {
  return [
    heading1("10. User Tagging"),
    para(
      "The User Tagging page (/user-tagging) is used to assign users to specific departments in the roles of " +
      "Head, Nodal Officer, and Reviewer. Access is restricted to Administrators."
    ),
    numbered("Select a department from the left panel."),
    numbered("In each role column (Head, Nodal, Reviewer), tag the appropriate users."),
    numbered("Save changes. Tagged users gain access to that department's announcements and appear in the department's team panel on the dashboard."),
    spacer(),
    note("A user must be tagged to a department before they can accept announcements or manage sub-components for that department."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 11: Activity Log ───────────────────────────────────────────────
function activityLogSection(): (Paragraph | Table)[] {
  return [
    heading1("11. Activity Log"),
    para(
      "The Activity Log (/activity-log) is a comprehensive, tamper-evident audit trail of every action performed " +
      "across the portal. It is accessible to Administrators and Dept. Nodal Officers " +
      "(Nodal Officers see only entries for users within their own department)."
    ),
    ...screenshot("activity-log.png", "Figure 9 — Activity Log"),

    heading2("11.1 Log Columns"),
    spacer(),
    simpleTable(
      ["Column", "Description"],
      [
        ["Timestamp", "Date and time the action occurred (DD-MM-YYYY HH:MM:SS)."],
        ["Actor", "Name of the user who performed the action."],
        ["Role", "Role of the actor at the time of the action."],
        ["Action", "A descriptive label such as Announcement Created, CMO Review, Password Changed."],
        ["Target", "The database entity affected (e.g., announcements, users, subcomponents)."],
        ["Route", "The API endpoint and HTTP method that was called."],
      ],
      [20, 80]
    ),
    spacer(),

    heading2("11.2 Common Action Types"),
    spacer(),
    simpleTable(
      ["Action Code", "Friendly Label"],
      [
        ["announcement.create", "Announcement Created"],
        ["announcement.submit", "Submitted for Review"],
        ["announcement.review", "CMO Review (Approve or Revert)"],
        ["announcement.accept", "Dept. Nodal Accepted"],
        ["announcement.final_accept", "Dept. Reviewer Final Accept"],
        ["announcement.start_progress", "Started Progress"],
        ["announcement.request_completion", "Completion Requested"],
        ["announcement.review_completion", "Completion Review (Approve or Revert)"],
        ["announcement.review_cmo_completion", "CMO Final Completion Review"],
        ["subcomponent.create", "Sub-component Added"],
        ["subcomponent.update", "Sub-component Updated"],
        ["auth.login", "Logged In"],
        ["auth.logout", "Logged Out"],
        ["auth.change_password", "Password Changed (self)"],
        ["auth.admin_reset_password", "Password Reset by Admin/Nodal"],
      ],
      [45, 55]
    ),
    spacer(),

    heading2("11.3 Filtering the Log"),
    bullet("Filter by User — select a user from the dropdown."),
    bullet("Filter by Role — narrows the current page by actor role."),
    bullet("Filter by Action — type an action code (e.g., announcement.review)."),
    bullet("Filter by Target — select the affected entity type."),
    bullet("From Date / To Date — restrict results to a date range."),
    bullet("Search — full-text search across route, action, and target fields."),
    bullet("Sort by any column by clicking the column header."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 12: Notifications ──────────────────────────────────────────────
function notificationsSection(): (Paragraph | Table)[] {
  return [
    heading1("12. Notifications"),
    para(
      "The portal sends real-time in-app notifications for workflow events that require your attention. " +
      "A red badge on the bell icon in the header shows the number of unread notifications."
    ),
    bullet("Click the bell icon to open the Notifications panel."),
    bullet("Notifications surface events such as: announcement reverted to you, announcement published to your department, completion review approved, new sub-component assigned."),
    bullet("Click a notification to navigate directly to the relevant announcement."),
    bullet("Notifications are targeted — you only see events relevant to your role and department."),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 13: Administrator Tools ────────────────────────────────────────
function adminToolsSection(): (Paragraph | Table)[] {
  return [
    heading1("13. Administrator Tools"),

    heading2("13.1 Flush Users (Emergency Reset)"),
    para(
      "The Flush Users page (/flushusers) is a restricted administrative tool available only to the Administrator role. " +
      "It provides a controlled mechanism to reset or remove user accounts in emergency scenarios."
    ),
    para(
      "This page should only be used by system administrators in consultation with the system owner. " +
      "Exercise extreme caution — the actions on this page are not easily reversible."
    ),
    spacer(),

    heading2("13.2 System Overview (Dashboard)"),
    para(
      "The Administrator dashboard includes a System Overview portlet that displays real-time user counts " +
      "broken down by role and status (Active / Inactive). This gives the Admin a quick health-check of the " +
      "user base without having to navigate to the full User Management page."
    ),
    spacer(),

    heading2("13.3 Recent Activity Feed"),
    para(
      "The Administrator dashboard also includes a Recent Activity Feed showing the latest actions " +
      "taken across the entire portal, providing immediate visibility into system activity without " +
      "navigating to the Activity Log."
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 14: Quick Reference ────────────────────────────────────────────
function quickReferenceSection(): (Paragraph | Table)[] {
  return [
    heading1("14. Quick Reference — All Pages"),
    spacer(),
    simpleTable(
      ["Page", "URL Path", "Access"],
      [
        ["Login", "/login", "Public (unauthenticated)"],
        ["Dashboard", "/", "All authenticated roles"],
        ["Announcements List", "/announcements", "All roles with view_announcements_menu"],
        ["Add Announcement", "/announcements/add", "CMO Nodal"],
        ["Edit Announcement", "/announcements/:id/edit", "CMO Nodal (creator), Dept. Nodal (post-revert)"],
        ["Announcement Detail", "/announcements/:id", "All roles with view_announcements_menu"],
        ["My Actions", "/my-actions", "All authenticated roles"],
        ["User Management", "/users", "Admin; Dept. Nodal (dept-scoped)"],
        ["User Tagging", "/user-tagging", "Admin"],
        ["Letter Count Report", "/reports/letter-count", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Location-Wise Report", "/reports/location-wise", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Department-Wise Report", "/reports/department-wise", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Department Detail Report", "/reports/department-wise/:dept", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Announcement Progress Report", "/reports/announcement-progress", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Occasion-Wise Report", "/reports/occasion-wise", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Aging Analysis Report", "/reports/aging-analysis", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Activity Log", "/activity-log", "Admin; Dept. Nodal (dept-scoped)"],
        ["UOI Notes", "/uoi-notes", "Admin, CM, CMO Nodal, CMO Reviewer"],
        ["Change Password", "/change-password", "All authenticated roles"],
        ["Flush Users", "/flushusers", "Admin only"],
      ],
      [25, 30, 45]
    ),
    spacer(),
    pageBreak(),
  ];
}

// ─── Section 15: Glossary ───────────────────────────────────────────────────
function glossarySection(): (Paragraph | Table)[] {
  return [
    heading1("15. Glossary"),
    spacer(),
    simpleTable(
      ["Term", "Definition"],
      [
        ["HCM Announcement", "A commitment or scheme announced by the Honourable Chief Minister and tracked in the portal."],
        ["CMO", "Chief Minister's Office — the team responsible for creating and reviewing announcements."],
        ["Dept. Nodal Officer", "The departmental officer responsible for accepting and executing announcements assigned to their department."],
        ["Sub-component", "A discrete task or deliverable within an announcement, assigned to individual team members."],
        ["Workflow Status", "The current stage of an announcement in its 10-step lifecycle."],
        ["UOI Note", "An Unofficial Issue Note — a CMO-level record linking a topic to a department, occasion, or location."],
        ["Activity Log", "The tamper-evident audit trail recording every user action in the portal."],
        ["Revert", "Sending an announcement back to a previous stage with mandatory comments explaining what needs to change."],
        ["Completion Review", "The two-stage sign-off process (Dept. Reviewer → CMO Reviewer) that formally closes an announcement."],
        ["Default Password", "The credential set for a new account. The portal forces the user to change it on first login."],
      ],
      [30, 70]
    ),
    spacer(),
  ];
}

// ─── Assemble & write ────────────────────────────────────────────────────────
async function main() {
  const allChildren: (Paragraph | Table | TableOfContents)[] = [
    ...coverSection(),
    ...aboutSection(),
    ...gettingStartedSection(),
    ...rolesSection(),
    ...dashboardSection(),
    ...announcementsSection(),
    ...myActionsSection(),
    ...reportsSection(),
    ...uoiNotesSection(),
    ...userManagementSection(),
    ...userTaggingSection(),
    ...activityLogSection(),
    ...notificationsSection(),
    ...adminToolsSection(),
    ...quickReferenceSection(),
    ...glossarySection(),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbered-list",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "1F2937" },
          paragraph: { spacing: { line: 276 } },
        },
        heading1: {
          run: { font: "Calibri", bold: true, size: 36, color: NAVY },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        heading2: {
          run: { font: "Calibri", bold: true, size: 28, color: NAVY },
          paragraph: { spacing: { before: 300, after: 160 } },
        },
        heading3: {
          run: { font: "Calibri", bold: true, size: 24, color: ORANGE },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: allChildren,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(OUTPUT, buffer);
  console.log(`\n✅  UserManual.docx written to: ${OUTPUT}`);
  console.log(`    Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error("❌  Failed to generate manual:", err);
  process.exit(1);
});
