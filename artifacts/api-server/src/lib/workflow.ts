import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  announcementCommentsTable,
  subComponentsTable,
  notificationsTable,
  assignmentPointersTable,
  usersTable,
  departmentsTable,
  categoriesTable,
  type WorkflowStatus,
  type Announcement,
  type NotificationType,
} from "@workspace/db";
import { HttpError } from "./errors";

// Drizzle's transaction type for the postgres-js / node-postgres driver. We
// keep this loose so all helpers compose with both `db.transaction(tx => …)`
// and the bare `db` (e.g. read paths).
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─────────────────────────────────────────────────────────────────────────────
// Workflow-state cohorts.
//
// These two sets are the single source of truth for "is this announcement in
// CMO Nodal's hands (pre-publication)" vs "has it been published into the
// downstream workflow (post-publication)". Every authorization gate that
// branches on workflow phase — attachment writes, drop, put-on-hold, etc. —
// must derive from these sets so the matrix cannot drift between routes.
//
// Terminal states (completed / dropped / on_hold) are deliberately in NEITHER
// set; they're handled by an explicit terminal-state guard in each route.
// ─────────────────────────────────────────────────────────────────────────────
export const PRE_PUBLICATION_STATUSES: ReadonlySet<WorkflowStatus> = new Set<WorkflowStatus>([
  "draft",
  "pending_cmo_review",
  "reverted_by_cmo",
  "pending_cmo_reconsideration",
]);

export const POST_PUBLICATION_STATUSES: ReadonlySet<WorkflowStatus> = new Set<WorkflowStatus>([
  "published",
  "pending_dept_acceptance",
  "accepted",
  "in_progress",
  "pending_completion_review",
  "reverted_by_dept_reviewer",
  "pending_cmo_completion_review",
]);

/**
 * Atomic round-robin pointer for CMO Reviewer assignment. Each call increments
 * the counter under a `SELECT … FOR UPDATE` lock so concurrent submits get
 * distinct outcomes — the in-browser localStorage pointer is gone for good.
 */
export async function pickNextCmoReviewerId(tx: Tx): Promise<number | null> {
  const reviewers = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "cmo_reviewer"), eq(usersTable.status, "Active")))
    .orderBy(usersTable.id);
  if (reviewers.length === 0) return null;

  const KEY = "cmo_reviewer";
  // Upsert ensures the row exists; .for("update") then locks it.
  await tx
    .insert(assignmentPointersTable)
    .values({ key: KEY, value: 0 })
    .onConflictDoNothing({ target: assignmentPointersTable.key });
  const locked = await tx
    .select({ value: assignmentPointersTable.value })
    .from(assignmentPointersTable)
    .where(eq(assignmentPointersTable.key, KEY))
    .for("update");
  const current = locked[0]?.value ?? 0;
  const idx = ((current % reviewers.length) + reviewers.length) % reviewers.length;
  const chosen = reviewers[idx]!;
  await tx
    .update(assignmentPointersTable)
    .set({ value: idx + 1, updatedAt: new Date() })
    .where(eq(assignmentPointersTable.key, KEY));
  return chosen.id;
}

/**
 * Re-read the announcement under its row lock and assert the optimistic-lock
 * version. Throws 409 on mismatch, 404 if missing. All workflow transitions
 * go through this helper.
 */
export async function loadForUpdate(
  tx: Tx,
  id: number,
  expectedVersion?: number,
): Promise<Announcement> {
  const rows = await tx
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, id))
    .for("update");
  const row = rows[0];
  if (!row) throw new HttpError(404, "Announcement not found");
  if (expectedVersion !== undefined && row.version !== expectedVersion) {
    throw new HttpError(409, "Announcement was modified by another user — please refresh");
  }
  return row;
}

interface ApplyOpts {
  status?: WorkflowStatus;
  set?: Partial<typeof announcementsTable.$inferInsert>;
}

/**
 * Apply a transactional update bumping `version` by 1. Throws 409 if the
 * lock check failed (which will be vanishingly rare since we already hold a
 * row lock from `loadForUpdate`, but the version field defends against
 * out-of-band updates).
 */
export async function applyUpdate(
  tx: Tx,
  id: number,
  fromVersion: number,
  opts: ApplyOpts,
): Promise<void> {
  const set: Partial<typeof announcementsTable.$inferInsert> = {
    ...opts.set,
    ...(opts.status ? { workflowStatus: opts.status } : {}),
    version: fromVersion + 1,
    updatedAt: new Date(),
  };
  const updated = await tx
    .update(announcementsTable)
    .set(set)
    .where(and(eq(announcementsTable.id, id), eq(announcementsTable.version, fromVersion)))
    .returning({ id: announcementsTable.id });
  if (!updated[0]) {
    throw new HttpError(409, "Announcement was modified by another user — please refresh");
  }
}

export async function addComment(
  tx: Tx,
  announcementId: number,
  userId: number,
  action: string,
  comment: string,
): Promise<void> {
  await tx.insert(announcementCommentsTable).values({
    announcementId,
    userId,
    action,
    comment,
  });
}

export async function notify(
  tx: Tx,
  recipientIds: number[],
  message: string,
  type: NotificationType,
  link?: string,
): Promise<void> {
  // De-duplicate: never send the same notification twice in one fan-out.
  const unique = Array.from(new Set(recipientIds));
  if (unique.length === 0) return;
  await tx.insert(notificationsTable).values(
    unique.map((userId) => ({
      userId,
      message,
      type,
      link: link ?? null,
    })),
  );
}

// ---------- Recipient helpers (notification matrix) ----------
//
// Every helper derives the recipient set from the announcement row, never
// from request body. The matrix lives at the top of AppStateContext.tsx and
// is mirrored 1:1 here.

export async function deptUsersOf(
  tx: Tx,
  departmentId: number,
  roles: ("dept_head" | "dept_nodal" | "dept_reviewer" | "dept_user")[],
): Promise<number[]> {
  const rows = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.departmentId, departmentId),
        inArray(usersTable.role, roles),
        eq(usersTable.status, "Active"),
      ),
    );
  return rows.map((r) => r.id);
}

export async function allCmoReviewers(tx: Tx): Promise<number[]> {
  const rows = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "cmo_reviewer"), eq(usersTable.status, "Active")));
  return rows.map((r) => r.id);
}

export async function allCmoNodals(tx: Tx): Promise<number[]> {
  const rows = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, "cmo_nodal"), eq(usersTable.status, "Active")));
  return rows.map((r) => r.id);
}

// ---------- Hydrated read shape used by all GET endpoints ----------

export interface HydratedAnnouncement {
  id: number;
  uniqueId: string;
  house: string;
  constituencyNumber: number;
  title: string;
  date: string;
  description: string;
  department: string;
  occasion: string;
  location: string;
  district: string | null;
  block: string | null;
  category: string | null;
  tags: string[];
  workflowStatus: WorkflowStatus;
  createdBy: number;
  assignedDeptUserId: number | null;
  assignedCmoReviewerId: number | null;
  acceptedByDeptNodalId: number | null;
  reconsiderationRequested: boolean;
  version: number;
}

/**
 * Server-side scoping. Filters announcements by actor role:
 * - admin: all announcements (no filter applied)
 * - chief_minister: all non-draft announcements (read-only oversight)
 * - cmo_nodal: only announcements created by themselves (any status)
 * - cmo_reviewer: only announcements assigned to them, excluding drafts
 * - dept roles: only their department's announcements in published or
 *   later statuses (draft, pending_cmo_review, reverted_by_cmo hidden)
 */
export async function buildVisibilityClause(
  actor: { id: number; role: string; department: string | null },
) {
  if (actor.role === "admin") return undefined;

  // CM (and OCAC Viewer, which mirrors CM) has full read-only oversight
  // across the entire pipeline (no drafts).
  if (actor.role === "chief_minister" || actor.role === "ocac_viewer") {
    return sql`${announcementsTable.workflowStatus} <> 'draft'`;
  }

  // CMO Nodal only sees announcements they personally created.
  if (actor.role === "cmo_nodal") {
    return eq(announcementsTable.createdBy, actor.id);
  }

  // CMO Reviewer only sees announcements assigned to them (covers their
  // pending-review queue, completion review, and previously actioned items).
  if (actor.role === "cmo_reviewer") {
    return and(
      sql`${announcementsTable.workflowStatus} <> 'draft'`,
      eq(announcementsTable.assignedCmoReviewerId, actor.id),
    );
  }

  // Department roles: only see their department's announcements that have
  // passed CMO approval (published or later). CMO-internal stages
  // (pending_cmo_review, reverted_by_cmo) remain invisible to departments.
  if (!actor.department) return sql`FALSE`;
  const deptRows = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, actor.department))
    .limit(1);
  if (!deptRows[0]) return sql`FALSE`;
  return and(
    eq(announcementsTable.departmentId, deptRows[0].id),
    sql`${announcementsTable.workflowStatus} NOT IN ('draft', 'pending_cmo_review', 'reverted_by_cmo')`,
  );
}

export function selectHydrated(tx: Tx | typeof db = db) {
  return tx
    .select({
      id: announcementsTable.id,
      uniqueId: announcementsTable.uniqueId,
      house: announcementsTable.house,
      constituencyNumber: announcementsTable.constituencyNumber,
      title: announcementsTable.title,
      date: announcementsTable.date,
      description: announcementsTable.description,
      department: departmentsTable.name,
      occasion: announcementsTable.occasion,
      location: announcementsTable.location,
      district: announcementsTable.district,
      block: announcementsTable.block,
      category: categoriesTable.name,
      otherCategory: announcementsTable.otherCategory,
      tags: announcementsTable.tags,
      workflowStatus: announcementsTable.workflowStatus,
      createdBy: announcementsTable.createdBy,
      assignedDeptUserId: announcementsTable.assignedDeptUserId,
      assignedCmoReviewerId: announcementsTable.assignedCmoReviewerId,
      acceptedByDeptNodalId: announcementsTable.acceptedByDeptNodalId,
      reconsiderationRequested: announcementsTable.reconsiderationRequested,
      statusBeforeHold: announcementsTable.statusBeforeHold,
      version: announcementsTable.version,
      createdAt: announcementsTable.createdAt,
    })
    .from(announcementsTable)
    .leftJoin(departmentsTable, eq(announcementsTable.departmentId, departmentsTable.id))
    .leftJoin(categoriesTable, eq(announcementsTable.categoryId, categoriesTable.id));
}

/**
 * Generate the next "CMA-NNNN" style human ID for a new announcement.
 * Globally serial across the table; legacy IDs (e.g. CMA-014A0017) are
 * intentionally ignored by the regex so the new sequence starts at 0001.
 * Done in-tx so concurrent inserts can't collide; the `unique_id` unique
 * index plus the route's 23505 → 409 retry contract is the safety net for
 * the inherent race between SELECT MAX and INSERT.
 */
export async function nextUniqueId(tx: Tx): Promise<string> {
  // Match any all-digit suffix (`^CMA-[0-9]+$`) so the sequence keeps growing
  // monotonically once it crosses 9999 into 5+ digits. The `padStart(4)` only
  // pads short numbers; longer values render naturally (e.g. CMA-12345). The
  // legacy `CMA-NNNXNNNN` rows have a letter in the suffix and are excluded.
  const result = await tx.execute<{ max_seq: number | null }>(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(${announcementsTable.uniqueId} FROM 5) AS INTEGER)), 0) AS max_seq
    FROM ${announcementsTable}
    WHERE ${announcementsTable.uniqueId} ~ '^CMA-[0-9]+$'
  `);
  const maxSeq = Number(result.rows[0]?.max_seq ?? 0);
  const seq = (Number.isFinite(maxSeq) ? maxSeq : 0) + 1;
  return `CMA-${String(seq).padStart(4, "0")}`;
}
