import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Generic key→counter table used for round-robin assignment pointers (e.g.
// the next CMO Reviewer index). The value is read with `SELECT ... FOR UPDATE`
// inside a workflow transaction so concurrent submits get distinct outcomes.
export const assignmentPointersTable = pgTable("assignment_pointers", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AssignmentPointer = typeof assignmentPointersTable.$inferSelect;
