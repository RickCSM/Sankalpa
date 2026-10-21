import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { CMO_APPROVAL_STATUSES, DEPARTMENT_APPROVAL_STATUSES, NON_PENDING_APPROVAL_LABELS, currentlyWithSql } from "./currentlyWith";

test("pending approval stages mirror initial/final CMO and departmental reviewer gates", () => {
  assert.deepEqual(CMO_APPROVAL_STATUSES, ["pending_cmo_review", "pending_cmo_completion_review"]);
  assert.deepEqual(DEPARTMENT_APPROVAL_STATUSES, ["pending_dept_acceptance", "pending_completion_review"]);
});
test("query respects active reviewers, exact CMO assignment, and department scope", () => {
  const compiled = new PgDialect().sqlToQuery(currentlyWithSql());
  for (const value of ["Active", "cmo_reviewer", "dept_reviewer", ...CMO_APPROVAL_STATUSES, ...DEPARTMENT_APPROVAL_STATUSES]) {
    assert.ok(compiled.params.includes(value));
  }
  assert.match(compiled.sql, /"users"\."id" = "announcements"\."assigned_cmo_reviewer_id"/);
  assert.match(compiled.sql, /"users"\."department_id" = "announcements"\."department_id"/);
  assert.match(compiled.sql, /"announcements"\."assigned_cmo_reviewer_id" is null/i);
});
test("shared queues aggregate all reviewer names and saved designations without exposing contact details", () => {
  const { sql: query } = new PgDialect().sqlToQuery(currentlyWithSql());
  assert.match(query, /string_agg/i);
  assert.match(query, /ORDER BY "users"\."name", "users"\."id"/);
  assert.match(query, /"users"\."designation_id" = "designations"\."id"/);
  assert.match(query, /Designation not assigned/);
  assert.doesNotMatch(query, /"email"|"mobile"|"password_hash"|LIMIT 1/i);
});
test("non-pending stages show accurate statuses rather than previous reviewers", () => {
  assert.equal(NON_PENDING_APPROVAL_LABELS.published, "Approved");
  assert.equal(NON_PENDING_APPROVAL_LABELS.completed, "Completed");
  assert.equal(NON_PENDING_APPROVAL_LABELS.on_hold, "On hold");
  assert.equal(NON_PENDING_APPROVAL_LABELS.pending_cmo_reconsideration, "Reconsideration requested");
  const compiled = new PgDialect().sqlToQuery(currentlyWithSql());
  for (const [status, label] of Object.entries(NON_PENDING_APPROVAL_LABELS)) {
    assert.ok(compiled.params.includes(status));
    assert.ok(compiled.params.includes(label));
  }
  assert.match(compiled.sql, /ELSE '—'/);
});
