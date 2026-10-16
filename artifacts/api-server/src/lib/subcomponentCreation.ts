import type { WorkflowStatus } from "@workspace/db";
import type { SessionUser } from "./auth";
import { HttpError } from "./errors";

/** Called with the locked parent row, in the same transaction as insertion. */
export function assertCanCreateSubcomponent(
  actor: Pick<SessionUser, "id" | "role">,
  parent: { workflowStatus: WorkflowStatus; acceptedByDeptNodalId: number | null },
) {
  if (actor.role !== "admin" &&
    (actor.role !== "dept_nodal" || parent.acceptedByDeptNodalId !== actor.id)) {
    throw new HttpError(403, "Only the accepting Department Nodal can add sub-components");
  }
  if (actor.role === "dept_nodal" && parent.workflowStatus !== "in_progress") {
    throw new HttpError(409, parent.workflowStatus === "accepted" ||
      parent.workflowStatus === "published" || parent.workflowStatus === "pending_dept_acceptance"
      ? "Please click Start Progress before adding a subcomponent."
      : "Sub-components can only be added while the announcement is In Progress.");
  }
  // Preserve the existing administrator workflow override, without broadening it.
  if (!["accepted", "in_progress", "reverted_by_dept_reviewer"].includes(parent.workflowStatus)) {
    throw new HttpError(409, "Sub-components can be added only after the Department Reviewer grants final acceptance");
  }
}
