import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userDesignationIdSchema, validateUserDesignation } from './userDesignation';
import { HttpError } from './errors';

test('user designation stays optional and accepts null or positive integer IDs', () => {
  for (const value of [undefined, null, 1]) assert.equal(userDesignationIdSchema.safeParse(value).success, true);
  for (const value of [0, -1, 1.5, '1', 'Director']) assert.equal(userDesignationIdSchema.safeParse(value).success, false);
});
test('only admin can assign or clear designations; omission preserves old workflows', () => {
  for (const role of ['dept_nodal', 'dept_reviewer', 'chief_minister', 'ocac_viewer']) {
    assert.equal(validateUserDesignation(role, undefined, 1), undefined);
    for (const selection of [null, 1]) {
      assert.throws(() => validateUserDesignation(role, selection, 1, { id: 1, isActive: true }),
        error => error instanceof HttpError && error.status === 403);
    }
  }
});
test('admin can assign an active designation or explicitly clear it', () => {
  assert.equal(validateUserDesignation('admin', 2, 1, { id: 2, isActive: true }), 2);
  assert.equal(validateUserDesignation('admin', null, 1), null);
  assert.equal(validateUserDesignation('admin', undefined, 1), undefined);
});
test('unknown and inactive new assignments are rejected', () => {
  for (const record of [undefined, { id: 2, isActive: true }, { id: 1, isActive: false }]) {
    assert.throws(() => validateUserDesignation('admin', 1, null, record),
      error => error instanceof HttpError && error.status === 400);
  }
});
test('an existing inactive designation can be retained on unrelated edits', () => {
  assert.equal(validateUserDesignation('admin', 1, 1, { id: 1, isActive: false }), 1);
});
