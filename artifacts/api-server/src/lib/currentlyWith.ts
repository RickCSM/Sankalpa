import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { announcementsTable, designationsTable, usersTable } from "@workspace/db";

// Mirror the normal approver gates, not notification recipients or admin overrides.
export const CMO_APPROVAL_STATUSES = ["pending_cmo_review", "pending_cmo_completion_review"] as const;
export const DEPARTMENT_APPROVAL_STATUSES = ["pending_dept_acceptance", "pending_completion_review"] as const;
export const NON_PENDING_APPROVAL_LABELS = {
  published: "Approved",
  completed: "Completed",
  reverted_by_cmo: "Returned for correction",
  reverted_by_dept_reviewer: "Returned for correction",
  pending_cmo_reconsideration: "Reconsideration requested",
  dropped: "Dropped",
  on_hold: "On hold",
} as const;

/** Correlated, read-only expression shared by hydration and pre-pagination sorting.
 * Returns only reviewer names/designations; never depends on the viewer's directory
 * permissions and does not widen the announcement's existing visibility scope.
 */
export function currentlyWithSql() {
  const cmoPending = inArray(announcementsTable.workflowStatus, [...CMO_APPROVAL_STATUSES]);
  const departmentPending = inArray(announcementsTable.workflowStatus, [...DEPARTMENT_APPROVAL_STATUSES]);
  const eligible = and(
    eq(usersTable.status, "Active"),
    or(
      and(cmoPending, eq(usersTable.role, "cmo_reviewer"),
        or(isNull(announcementsTable.assignedCmoReviewerId), eq(usersTable.id, announcementsTable.assignedCmoReviewerId))),
      and(departmentPending, eq(usersTable.role, "dept_reviewer"),
        eq(usersTable.departmentId, announcementsTable.departmentId)),
    ),
  );
  const approvers = sql<string>`(
    SELECT string_agg(
      ${usersTable.name} || ' — ' || COALESCE(NULLIF(BTRIM(${designationsTable.name}), ''), 'Designation not assigned'),
      E'\\n' ORDER BY ${usersTable.name}, ${usersTable.id})
    FROM ${usersTable}
    LEFT JOIN ${designationsTable} ON ${usersTable.designationId} = ${designationsTable.id}
    WHERE ${eligible}
  )`;
  const labels = sql.join(Object.entries(NON_PENDING_APPROVAL_LABELS).map(([status, label]) =>
    sql`WHEN ${announcementsTable.workflowStatus} = ${status} THEN ${label}`), sql` `);
  return sql<string>`CASE
    WHEN ${cmoPending} THEN COALESCE(${approvers},
      CASE WHEN ${announcementsTable.assignedCmoReviewerId} IS NULL
        THEN 'Awaiting CMO Reviewer assignment' ELSE 'Assigned CMO Reviewer unavailable' END)
    WHEN ${departmentPending} THEN COALESCE(${approvers}, 'Awaiting Department Reviewer assignment')
    ${labels}
    ELSE '—'
  END`;
}
