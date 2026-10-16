import { test } from "node:test";
import assert from "node:assert/strict";
import { startProgressSchema } from "./startProgress";

test("start progress rejects missing, empty and whitespace-only comments", () => {
  for (const comment of [undefined, null, "", "  ", "\n\t", "\u00a0"]) {
    const result = startProgressSchema.safeParse({ version: 1, comment });
    assert.equal(result.success, false);
  }
});

test("start progress trims and retains the actual initiation comment", () => {
  assert.deepEqual(startProgressSchema.parse({ version: 3, comment: "  Work plan confirmed.\n" }),
    { version: 3, comment: "Work plan confirmed." });
});

test("start progress enforces the comment length and valid version", () => {
  assert.equal(startProgressSchema.safeParse({ version: 1, comment: "x".repeat(2001) }).success, false);
  assert.equal(startProgressSchema.safeParse({ version: 1, comment: "x".repeat(2000) }).success, true);
  for (const version of [undefined, -1, 1.5, "1"]) {
    assert.equal(startProgressSchema.safeParse({ version, comment: "Starting work." }).success, false);
  }
});

test("comment identity and timestamps cannot be supplied by the caller", () => {
  assert.deepEqual(startProgressSchema.parse({
    version: 1, comment: "Starting work.", userId: 999, createdAt: "1900-01-01",
  }), { version: 1, comment: "Starting work." });
});
