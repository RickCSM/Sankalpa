import { test } from "node:test";
import assert from "node:assert/strict";
import { completionRequestSchema } from "./completionRequest";

test("completion requires nonblank confirmation remarks", () => {
  for (const remarks of [undefined, "", "   ", "\n\t"]) {
    assert.equal(completionRequestSchema.safeParse({ version: 1, remarks }).success, false);
  }
  assert.equal(completionRequestSchema.safeParse({ version: 1, remarks: "x".repeat(2001) }).success, false);
});

test("completion accepts trimmed remarks without an attachment", () => {
  assert.deepEqual(completionRequestSchema.parse({ version: 1, remarks: " Completed and verified. " }),
    { version: 1, remarks: "Completed and verified." });
});
