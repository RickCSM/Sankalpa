import { test } from "node:test";
import assert from "node:assert/strict";
import { userRoles, workflowStatuses } from "@workspace/db";
import { announcementStatusUpdateSchema, assertCanPostAnnouncementUpdate } from "./announcementStatusUpdate";
import { HttpError } from "./errors";

const actor = { id: 42, role: "dept_nodal" as const };
const parent = { acceptedByDeptNodalId: 42, workflowStatus: "in_progress" as const };

test("status updates require nonblank remarks and a valid version", () => {
  for (const comment of [undefined, "", " \n\t", "x".repeat(2001)]) {
    assert.equal(announcementStatusUpdateSchema.safeParse({ version: 1, comment }).success, false);
  }
  for (const version of [undefined, -1, 0.5, "1"]) {
    assert.equal(announcementStatusUpdateSchema.safeParse({ version, comment: "Progress" }).success, false);
  }
  assert.deepEqual(announcementStatusUpdateSchema.parse({
    version: 0, comment: " Progress \n", userId: 999, createdAt: "1900-01-01",
  }), { version: 0, comment: "Progress" });
});

test("only the accepting Department Nodal can post direct status updates", () => {
  assert.doesNotThrow(() => assertCanPostAnnouncementUpdate(actor, parent, 0));
  assert.throws(() => assertCanPostAnnouncementUpdate({ ...actor, id: 43 }, parent, 0),
    error => error instanceof HttpError && error.status === 403);
  for (const role of userRoles.filter(role => role !== "dept_nodal")) {
    assert.throws(() => assertCanPostAnnouncementUpdate({ ...actor, role }, parent, 0),
      error => error instanceof HttpError && error.status === 403);
  }
});

test("direct status updates require active work and no sub-components", () => {
  for (const workflowStatus of workflowStatuses) {
    if (["in_progress", "reverted_by_dept_reviewer"].includes(workflowStatus)) {
      assert.doesNotThrow(() => assertCanPostAnnouncementUpdate(actor, { ...parent, workflowStatus }, 0));
    } else {
      assert.throws(() => assertCanPostAnnouncementUpdate(actor, { ...parent, workflowStatus }, 0),
        error => error instanceof HttpError && error.status === 409);
    }
  }
  for (const count of [1, 5, 200]) {
    assert.throws(() => assertCanPostAnnouncementUpdate(actor, parent, count),
      error => error instanceof HttpError && error.status === 409);
  }
});
