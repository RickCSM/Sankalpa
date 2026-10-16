import { test } from "node:test";
import assert from "node:assert/strict";
import { designationCreateSchema, masterNameSchema, masterPatchSchema } from "./masterDataValidation";

test("designation name is required and cannot contain only spaces", () => {
  for (const name of [undefined, null, "", "   "]) {
    assert.equal(designationCreateSchema.safeParse({ name }).success, false);
  }
});
test("designation names are trimmed and default to active", () => {
  assert.deepEqual(designationCreateSchema.parse({ name: "  Director  " }), { name: "Director", isActive: true });
});
test("designation creation supports inactive records and rejects invalid statuses", () => {
  assert.equal(designationCreateSchema.parse({ name: "Director", isActive: false }).isActive, false);
  for (const isActive of ["false", 0, null]) {
    assert.equal(designationCreateSchema.safeParse({ name: "Director", isActive }).success, false);
  }
});
test("master and designation names enforce the same 200-character limit", () => {
  assert.equal(masterNameSchema.safeParse({ name: "A".repeat(200) }).success, true);
  assert.equal(designationCreateSchema.safeParse({ name: "A".repeat(201) }).success, false);
  assert.equal(masterPatchSchema.safeParse({ name: "A".repeat(201) }).success, false);
});
test("updates may rename, change status, or do both", () => {
  assert.deepEqual(masterPatchSchema.parse({ name: "  Secretary  ", isActive: false }), { name: "Secretary", isActive: false });
  assert.deepEqual(masterPatchSchema.parse({ isActive: true }), { isActive: true });
  assert.deepEqual(masterPatchSchema.parse({ name: "Director" }), { name: "Director" });
});
test("empty or invalid updates do not silently succeed", () => {
  for (const patch of [{}, { name: " " }, { isActive: "inactive" }, { name: null }]) {
    assert.equal(masterPatchSchema.safeParse(patch).success, false);
  }
});
