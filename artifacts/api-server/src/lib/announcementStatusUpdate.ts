import { z } from "zod";
import { CreateAnnouncementStatusUpdateBody } from "@workspace/api-zod";
import type { WorkflowStatus } from "@workspace/db";
import type { SessionUser } from "./auth";
import { HttpError } from "./errors";

export const announcementStatusUpdateSchema = CreateAnnouncementStatusUpdateBody.extend({
  version: z.number().int().min(0),
  comment: z.string().trim().min(1, "Please enter a status update.").max(2000),
});

/** Use only with the locked parent and sub-component count in the same transaction. */
export function assertCanPostAnnouncementUpdate(
  actor: Pick<SessionUser, "id" | "role">,
  parent: { acceptedByDeptNodalId: number | null; workflowStatus: WorkflowStatus },
  subComponentCount: number,
) {
  if (actor.role !== "dept_nodal" || parent.acceptedByDeptNodalId !== actor.id) {
    throw new HttpError(403, "Only the accepting Department Nodal can post status updates");
  }
  if (!["in_progress", "reverted_by_dept_reviewer"].includes(parent.workflowStatus)) {
    throw new HttpError(409, "Status updates are allowed only after Start Progress, while work is active");
  }
  if (subComponentCount !== 0) {
    throw new HttpError(409, "Please post updates against the existing sub-components");
  }
}
