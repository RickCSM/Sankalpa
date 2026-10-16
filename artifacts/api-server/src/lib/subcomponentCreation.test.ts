import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkflowStatus, UserRole } from "@workspace/db";
import { HttpError } from "./errors";
import { assertCanCreateSubcomponent } from "./subcomponentCreation";

const statuses: WorkflowStatus[] = [
  "draft", "pending_cmo_review", "reverted_by_cmo", "pending_cmo_reconsideration",
  "published", "pending_dept_acceptance", "accepted", "in_progress",
  "pending_completion_review", "reverted_by_dept_reviewer",
  "pending_cmo_completion_review", "completed", "dropped", "on_hold",
];
const owner = { id: 42, role: "dept_nodal" as const };
const parent = (workflowStatus: WorkflowStatus) => ({ workflowStatus, acceptedByDeptNodalId: owner.id });

test("Department Nodal can create sub-components only at the saved in_progress status", () => {
  for (const status of statuses) {
    if (status === "in_progress") assert.doesNotThrow(() => assertCanCreateSubcomponent(owner, parent(status)));
    else assert.throws(() => assertCanCreateSubcomponent(owner, parent(status)),
      error => error instanceof HttpError && error.status === 409);
  }
});

test("accepted is not started and returns the requested guidance", () => {
  assert.throws(() => assertCanCreateSubcomponent(owner, parent("accepted")),
    error => error instanceof HttpError && error.status === 409 &&
      error.message === "Please click Start Progress before adding a subcomponent.");
});

test("another Nodal cannot add sub-components to the accepting Nodal's task", () => {
  assert.throws(() => assertCanCreateSubcomponent({ ...owner, id: 43 }, parent("in_progress")),
    error => error instanceof HttpError && error.status === 403);
});

test("changing the owner's role does not retain Nodal creation authority", () => {
  const otherRoles: UserRole[] = ["chief_minister", "cmo_nodal", "cmo_reviewer", "dept_reviewer", "dept_head", "dept_user", "dept_viewer", "ocac_viewer"];
  for (const role of otherRoles) {
    assert.throws(() => assertCanCreateSubcomponent({ id: owner.id, role }, parent("in_progress")),
      error => error instanceof HttpError && error.status === 403);
  }
});

test("administrator's existing status rules remain unchanged", () => {
  const admin = { id: 1, role: "admin" as const };
  for (const status of statuses) {
    if (["accepted", "in_progress", "reverted_by_dept_reviewer"].includes(status)) {
      assert.doesNotThrow(() => assertCanCreateSubcomponent(admin, parent(status)));
    } else {
      assert.throws(() => assertCanCreateSubcomponent(admin, parent(status)),
        error => error instanceof HttpError && error.status === 409);
    }
  }
});

test("a later parent status change immediately revokes Nodal creation eligibility", () => {
  const task = parent("accepted");
  assert.throws(() => assertCanCreateSubcomponent(owner, task));
  task.workflowStatus = "in_progress";
  assert.doesNotThrow(() => assertCanCreateSubcomponent(owner, task));
  for (const status of ["on_hold", "pending_completion_review", "completed", "dropped"] as const) {
    task.workflowStatus = status;
    assert.throws(() => assertCanCreateSubcomponent(owner, task),
      error => error instanceof HttpError && error.status === 409);
  }
});
