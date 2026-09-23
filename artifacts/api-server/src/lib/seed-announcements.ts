import { inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  announcementCommentsTable,
  subComponentsTable,
  departmentsTable,
  categoriesTable,
  tagsTable,
  usersTable,
  type WorkflowStatus,
} from "@workspace/db";
import { logger } from "./logger";

// Server-side port of artifacts/sankalpa-odisha/src/data/mockDataGenerator.ts.
// Seeds ~250 synthetic announcements with the same status distribution,
// per-department spread, comment/timeline trail and a deterministic set of
// closure-stage demo scenarios for the Agriculture department.
//
// Idempotent: the seed bails out the first time it sees an existing row in
// `announcements`. We never re-run on top of real data because the IDs will
// not line up with the generator's stable RNG anyway — Postgres assigns the
// serial PKs.

const TAGS = [
  "Budget", "Rural", "Urban", "Women", "Youth", "Digital", "Employment",
  "Tribal", "Coastal", "Green Initiative", "PPP", "Flagship Scheme",
  "Infrastructure", "Capacity Building", "Awareness", "Emergency",
  "Innovation", "Welfare", "Monitoring", "Reform",
];

const CATEGORIES = [
  "Infrastructure", "Health", "Education", "Agriculture", "Social Welfare",
  "Governance", "Environment", "Digital & Technology", "Employment & Skill",
  "Finance & Revenue", "Law & Order", "Tourism & Culture",
];

const OCCASIONS = [
  "Budget Session", "State Assembly", "Press Conference", "Republic Day",
  "Independence Day", "Farmer's Day", "World Environment Day",
  "International Women's Day", "Children's Day", "National Education Day",
  "National Sports Day", "World Health Day", "Engineer's Day",
  "National Technology Day", "Civil Services Day", "Foundation Day",
  "Utkal Divas", "Rajyotsav", "District Visit", "Review Meeting",
  "State Cabinet Meeting", "Public Rally", "Inauguration Ceremony",
  "Panchayati Raj Day", "Labour Day", "Constitution Day",
];

const LOCATIONS = [
  "Bhubaneswar", "Cuttack", "Berhampur", "Sambalpur", "Rourkela", "Puri",
  "Balasore", "Bhadrak", "Baripada", "Jharsuguda", "Angul", "Dhenkanal",
  "Koraput", "Rayagada", "Jeypore", "Kendrapara", "Jajpur", "Jagatsinghpur",
  "Khordha", "Nayagarh", "Kalahandi", "Bolangir", "Sundargarh", "Keonjhar",
  "Mayurbhanj", "Ganjam", "Malkangiri", "Nabarangpur", "Nuapada",
  "Kandhamal", "Bargarh", "Deogarh",
];

const DEPARTMENT_TITLES: Record<string, string[]> = {
  "Agriculture & Farmers' Emp": [
    "Expansion of Micro-Irrigation Systems", "Organic Farming Promotion Scheme",
    "Farmer Training Centre Establishment", "Crop Diversification Programme",
    "Agricultural Mechanization Drive", "Soil Health Card Distribution",
    "Seed Distribution for Kharif Season", "Cold Storage Construction in Rural Areas",
    "Dairy Development Initiative", "Farmer Producer Organization Support",
    "Integrated Pest Management Programme", "Agricultural Credit Facilitation",
  ],
};

const DISTRICT_BLOCKS: Record<string, string[]> = {
  Angul: ["Angul", "Athamallik", "Banarpal", "Chhendipada", "Talcher"],
  Balangir: ["Agalpur", "Balangir", "Bangomunda", "Belpara"],
  Balasore: ["Balasore", "Basta", "Bhograi", "Jaleswar", "Soro"],
  Bargarh: ["Ambabhona", "Attabira", "Bargarh", "Bijepur"],
  Bhadrak: ["Basudevpur", "Bhadrak", "Bhandaripokhari", "Tihidi"],
  Cuttack: ["Athagarh", "Banki", "Cuttack Sadar", "Salepur"],
  Dhenkanal: ["Bhuban", "Dhenkanal Sadar", "Hindol", "Kamakhyanagar"],
  Ganjam: ["Aska", "Bhanjanagar", "Buguda", "Chatrapur", "Hinjilicut"],
  Jagatsinghpur: ["Balikuda", "Jagatsinghpur", "Kujanga", "Tirtol"],
  Jajpur: ["Bari", "Binjharpur", "Dharmasala", "Jajpur"],
  Jharsuguda: ["Jharsuguda", "Kirmira", "Lakhanpur"],
  Kalahandi: ["Bhawanipatna", "Dharmagarh", "Junagarh", "Kesinga"],
  Kandhamal: ["Balliguda", "Daringbadi", "Phulbani", "Tikabali"],
  Kendrapara: ["Aul", "Garadpur", "Kendrapara", "Pattamundai"],
  Kendujhar: ["Anandapur", "Champua", "Joda", "Kendujhar Sadar"],
  Khordha: ["Balianta", "Begunia", "Bolagarh", "Jatni", "Khordha"],
  Koraput: ["Borigumma", "Jeypore", "Koraput", "Kotpad", "Pottangi"],
  Malkangiri: ["Kalimela", "Korukonda", "Malkangiri", "Mathili"],
  Mayurbhanj: ["Baripada", "Bisoi", "Karanjia", "Rairangpur", "Udala"],
  Nabarangpur: ["Dabugam", "Nabarangpur", "Papadahandi", "Umerkote"],
  Nayagarh: ["Daspalla", "Khandapada", "Nayagarh", "Ranpur"],
  Puri: ["Astaranga", "Brahmagiri", "Nimapara", "Pipili", "Puri Sadar"],
  Rayagada: ["Bissamcuttack", "Gunupur", "Muniguda", "Rayagada"],
  Sambalpur: ["Jamankira", "Kuchinda", "Maneswar", "Rengali", "Sambalpur"],
  Sundargarh: ["Bisra", "Bonai", "Hemgir", "Rajgangpur", "Sundargarh"],
};

const DISTRICTS = Object.keys(DISTRICT_BLOCKS).sort();

const STATUS_WEIGHTS: { status: WorkflowStatus; weight: number }[] = [
  { status: "draft", weight: 15 },
  { status: "pending_cmo_review", weight: 20 },
  { status: "published", weight: 50 },
  { status: "accepted", weight: 30 },
  { status: "in_progress", weight: 40 },
  { status: "pending_completion_review", weight: 12 },
  { status: "reverted_by_cmo", weight: 8 },
  { status: "reverted_by_dept_reviewer", weight: 7 },
  { status: "pending_cmo_completion_review", weight: 10 },
  { status: "completed", weight: 25 },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export async function seedAnnouncements(): Promise<void> {
  const existing = await db
    .select({ id: announcementsTable.id })
    .from(announcementsTable)
    .limit(1);
  if (existing[0]) {
    logger.info("Announcements already present, skipping seed");
    return;
  }

  // Resolve foreign keys.
  const deptRows = await db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable);
  const deptIdByName = new Map(deptRows.map((d) => [d.name, d.id]));
  const catRows = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable);
  const catIdByName = new Map(catRows.map((c) => [c.name, c.id]));
  const userRows = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable);
  const userIdByName = new Map(userRows.map((u) => [u.username, u.id]));

  const cmoNodalId = userIdByName.get("cmo_nodal");
  const cmoReviewerId = userIdByName.get("cmo_reviewer");
  const deptHeadId = userIdByName.get("dept_head");
  const deptNodalId = userIdByName.get("dept_nodal");
  const deptReviewerId = userIdByName.get("dept_reviewer");
  if (!cmoNodalId || !cmoReviewerId) {
    logger.warn("Skipping announcement seed — required users missing");
    return;
  }

  // Ensure default tags & categories from the generator's tag list exist.
  for (const name of TAGS) {
    await db.insert(tagsTable).values({ name }).onConflictDoNothing({ target: tagsTable.name });
  }
  for (const name of CATEGORIES) {
    await db.insert(categoriesTable).values({ name }).onConflictDoNothing({ target: categoriesTable.name });
  }
  // Re-resolve categories after possible inserts.
  const catRows2 = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable);
  for (const c of catRows2) catIdByName.set(c.name, c.id);

  const departmentList = deptRows.map((d) => d.name).sort();
  if (departmentList.length === 0) {
    logger.warn("Skipping announcement seed — no departments");
    return;
  }

  const rand = seededRandom(42);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const pickN = <T,>(arr: T[], n: number): T[] => {
    const shuffled = [...arr].sort(() => rand() - 0.5);
    return shuffled.slice(0, n);
  };

  const pickWeightedStatus = (): WorkflowStatus => {
    const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
    let r = rand() * total;
    for (const sw of STATUS_WEIGHTS) {
      r -= sw.weight;
      if (r <= 0) return sw.status;
    }
    return "published";
  };

  const generateDate = (): string => {
    const startMs = new Date("2024-01-01").getTime();
    const endMs = new Date("2025-12-31").getTime();
    const d = new Date(startMs + rand() * (endMs - startMs));
    return d.toISOString().split("T")[0]!;
  };

  let globalSeq = 0;

  const targetPerDept = Math.floor(250 / departmentList.length);
  const remainder = 250 - targetPerDept * departmentList.length;

  type AnnInsert = typeof announcementsTable.$inferInsert;
  type CommentInsert = typeof announcementCommentsTable.$inferInsert;
  type SubInsert = typeof subComponentsTable.$inferInsert;

  interface PendingAnn {
    insert: AnnInsert;
    comments: Omit<CommentInsert, "announcementId">[];
  }

  const pending: PendingAnn[] = [];

  for (let i = 0; i < departmentList.length; i++) {
    const dept = departmentList[i]!;
    const count = targetPerDept + (i < remainder ? 1 : 0);
    const titles = DEPARTMENT_TITLES[dept] ?? [
      `${dept} Development Programme`,
      `${dept} Enhancement Initiative`,
      `${dept} Modernization Scheme`,
    ];
    const departmentId = deptIdByName.get(dept)!;

    for (let j = 0; j < count; j++) {
      const baseTitle = titles[j % titles.length]!;
      const suffix = count > titles.length && j >= titles.length
        ? ` - Phase ${Math.ceil((j + 1) / titles.length)}`
        : "";
      const title = baseTitle + suffix;
      const date = generateDate();
      const status = pickWeightedStatus();
      const district = pick(DISTRICTS);
      const blocks = DISTRICT_BLOCKS[district];
      const block = blocks ? pick(blocks) : null;
      const tags = pickN(TAGS, 1 + Math.floor(rand() * 3));
      const categoryName = pick(CATEGORIES);
      const categoryId = catIdByName.get(categoryName) ?? null;

      globalSeq += 1;
      const uniqueId = `CMA-${String(globalSeq).padStart(4, "0")}`;

      const isAgri = dept === "Agriculture & Farmers' Emp";
      const acceptedNodal =
        isAgri && deptNodalId &&
        ["pending_dept_acceptance", "accepted", "in_progress",
         "pending_completion_review", "reverted_by_dept_reviewer",
         "pending_cmo_completion_review", "completed"].includes(status)
          ? deptNodalId
          : null;
      const assignedCmo =
        status === "pending_cmo_review" || status === "pending_cmo_completion_review"
          ? cmoReviewerId
          : null;

      const insert: AnnInsert = {
        uniqueId,
        house: null,
        constituencyNumber: null,
        title,
        date,
        description: `Implementation of ${title.toLowerCase()} under the ${dept} department across designated areas of Odisha.`,
        departmentId,
        occasion: pick(OCCASIONS),
        location: pick(LOCATIONS),
        district,
        block,
        categoryId,
        tags,
        workflowStatus: status,
        createdBy: cmoNodalId,
        assignedCmoReviewerId: assignedCmo,
        acceptedByDeptNodalId: acceptedNodal,
        version: 0,
      };

      const baseTs = new Date(`${date}T10:00:00Z`);
      const ts = (offsetHr: number) => new Date(baseTs.getTime() + offsetHr * 3600 * 1000);
      const comments: Omit<CommentInsert, "announcementId">[] = [
        { userId: cmoNodalId, action: "Created", comment: `New announcement created: ${title}.`, createdAt: ts(0) },
      ];
      if (status !== "draft") {
        comments.push({ userId: cmoNodalId, action: "Submitted for Review", comment: "Submitted for CMO review.", createdAt: ts(1) });
      }
      if (!["draft", "pending_cmo_review", "reverted_by_cmo"].includes(status)) {
        comments.push({ userId: cmoReviewerId, action: "Approved", comment: "Reviewed and approved for publication.", createdAt: ts(4) });
      }
      if (status === "reverted_by_cmo") {
        comments.push({ userId: cmoReviewerId, action: "Reverted", comment: "Reverted for corrections. Please review and resubmit.", createdAt: ts(4) });
      }
      if (deptHeadId && ["accepted", "in_progress", "pending_completion_review", "reverted_by_dept_reviewer", "completed", "pending_cmo_completion_review"].includes(status)) {
        comments.push({ userId: deptHeadId, action: "Accepted", comment: "Accepted by department for implementation.", createdAt: ts(6) });
      }
      if (deptReviewerId && ["completed", "pending_cmo_completion_review"].includes(status)) {
        comments.push({ userId: deptReviewerId, action: "Dept Completion Approved", comment: "Completion verified and approved by department reviewer.", createdAt: ts(8) });
      }
      if (status === "completed") {
        comments.push({ userId: cmoReviewerId, action: "CMO Completion Approved", comment: "Final completion approved by CMO.", createdAt: ts(9) });
      }
      if (deptReviewerId && status === "reverted_by_dept_reviewer") {
        comments.push({ userId: deptReviewerId, action: "Completion Reverted", comment: "Completion not satisfactory. Please address the remaining items.", createdAt: ts(8) });
      }

      pending.push({ insert, comments });
    }
  }

  // Closure demo scenarios for Agriculture (mirrors the original generator).
  interface ClosureScenario {
    title: string;
    status: WorkflowStatus;
    subs: { title: string; description: string; status: "Pending" | "In Progress" | "Completed" }[];
  }
  const agriDeptId = deptIdByName.get("Agriculture & Farmers' Emp");
  if (agriDeptId && deptNodalId && deptReviewerId) {
    const closureScenarios: ClosureScenario[] = [
      { title: "Closure Demo: In Progress with Pending Sub-Components", status: "in_progress",
        subs: [
          { title: "Site Survey", description: "Survey across 12 villages.", status: "Completed" },
          { title: "Equipment Procurement", description: "Procure 200 pump sets.", status: "In Progress" },
        ] },
      { title: "Closure Demo: All Sub-Components Completed", status: "in_progress",
        subs: [
          { title: "Awareness Camps", description: "Conduct 25 farmer awareness camps.", status: "Completed" },
          { title: "Subsidy Disbursement", description: "Disburse subsidy to 500 farmers.", status: "Completed" },
        ] },
      { title: "Closure Demo: Pending Department Completion Review", status: "pending_completion_review",
        subs: [
          { title: "Soil Testing Drive", description: "Test soil across 30 panchayats.", status: "Completed" },
          { title: "Distribution Reporting", description: "Submit district-wise reports.", status: "Completed" },
        ] },
      { title: "Closure Demo: Reverted by Department Reviewer", status: "reverted_by_dept_reviewer",
        subs: [
          { title: "Compliance Audit", description: "Audit fund utilisation.", status: "Completed" },
          { title: "Beneficiary Verification", description: "Verify 800 beneficiaries.", status: "Completed" },
        ] },
      { title: "Closure Demo: Pending CMO Completion Review", status: "pending_cmo_completion_review",
        subs: [
          { title: "Final Inspection", description: "Joint inspection by district team.", status: "Completed" },
          { title: "Outcome Report", description: "Publish outcome report.", status: "Completed" },
        ] },
      { title: "Closure Demo: Fully Completed", status: "completed",
        subs: [
          { title: "Programme Closure", description: "Programme closed administratively.", status: "Completed" },
          { title: "Asset Handover", description: "Hand over assets to district administration.", status: "Completed" },
        ] },
    ];
    const fixedDate = "2025-09-01";
    for (const scen of closureScenarios) {
      globalSeq += 1;
      const uniqueId = `CMA-${String(globalSeq).padStart(4, "0")}`;
      pending.push({
        insert: {
          uniqueId,
          house: null,
          constituencyNumber: null,
          title: scen.title,
          date: fixedDate,
          description: `Deterministic closure-workflow demonstration fixture: ${scen.title}.`,
          departmentId: agriDeptId,
          occasion: "Review Meeting",
          location: "Bhubaneswar",
          district: "Khordha",
          block: "Khordha",
          categoryId: catIdByName.get("Agriculture") ?? null,
          tags: ["Flagship Scheme", "Monitoring"],
          workflowStatus: scen.status,
          createdBy: cmoNodalId,
          assignedCmoReviewerId: scen.status === "pending_cmo_completion_review" ? cmoReviewerId : null,
          acceptedByDeptNodalId: deptNodalId,
          version: 0,
        },
        comments: [
          { userId: cmoNodalId, action: "Created", comment: `New announcement created: ${scen.title}.`, createdAt: new Date(`${fixedDate}T09:00:00Z`) },
          { userId: cmoNodalId, action: "Submitted for Review", comment: "Submitted for CMO review.", createdAt: new Date(`${fixedDate}T10:00:00Z`) },
          { userId: cmoReviewerId, action: "Approved", comment: "Reviewed and approved for publication.", createdAt: new Date(`${fixedDate}T11:00:00Z`) },
          { userId: deptNodalId, action: "Accepted by Dept Nodal", comment: "Department Nodal accepted; awaiting Department Reviewer final acceptance.", createdAt: new Date(`${fixedDate}T15:00:00Z`) },
          { userId: deptReviewerId, action: "Final Acceptance", comment: "Final acceptance granted by Department Reviewer.", createdAt: new Date(`${fixedDate}T17:00:00Z`) },
        ],
      });
      // Tag scenario subs onto the inserted announcement after the bulk insert.
      (scen as ClosureScenario & { _subs?: typeof scen.subs })._subs = scen.subs;
    }

    // Bulk insert announcements first to obtain their generated IDs.
    await db.transaction(async (tx) => {
      for (const p of pending) {
        const [row] = await tx
          .insert(announcementsTable)
          .values(p.insert)
          .returning({ id: announcementsTable.id });
        if (!row) continue;
        const aId = row.id;
        for (const c of p.comments) {
          await tx.insert(announcementCommentsTable).values({
            ...c,
            announcementId: aId,
          });
        }
      }

      // Sub-components: only the closure scenarios + a couple legacy ones for the
      // first Agriculture announcement (parity with old initialSubComponents).
      // Pull the closure announcements back by uniqueId.
      const closureUniqueIds = pending
        .slice(pending.length - closureScenarios.length)
        .map((p) => p.insert.uniqueId);
      const inserted = await tx
        .select({ id: announcementsTable.id, uniqueId: announcementsTable.uniqueId })
        .from(announcementsTable)
        .where(inArray(announcementsTable.uniqueId, closureUniqueIds));
      const idByUid = new Map(inserted.map((r) => [r.uniqueId, r.id]));
      for (let i = 0; i < closureScenarios.length; i++) {
        const scen = closureScenarios[i]!;
        const uid = closureUniqueIds[i]!;
        const aId = idByUid.get(uid);
        if (!aId) continue;
        for (const s of scen.subs) {
          const sub: SubInsert = {
            announcementId: aId,
            title: s.title,
            description: s.description,
            assignedTo: deptNodalId,
            status: s.status,
          };
          await tx.insert(subComponentsTable).values(sub);
        }
      }
    });
    logger.info({ count: pending.length }, "Seeded announcements");
    return;
  }

  // Fallback path (no agri dept users): just bulk-insert announcements + comments.
  await db.transaction(async (tx) => {
    for (const p of pending) {
      const [row] = await tx
        .insert(announcementsTable)
        .values(p.insert)
        .returning({ id: announcementsTable.id });
      if (!row) continue;
      const aId = row.id;
      for (const c of p.comments) {
        await tx.insert(announcementCommentsTable).values({ ...c, announcementId: aId });
      }
    }
  });
  logger.info({ count: pending.length }, "Seeded announcements (no closure scenarios)");
}
