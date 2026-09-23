import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { subComponentsTable } from "./sub-components";
import { usersTable } from "./users";

export const subComponentRemarksTable = pgTable(
  "sub_component_remarks",
  {
    id: serial("id").primaryKey(),
    subComponentId: integer("sub_component_id")
      .notNull()
      .references(() => subComponentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    remark: text("remark").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sub_component_remarks_sub_component_idx").on(t.subComponentId)],
);

export type SubComponentRemarkRow = typeof subComponentRemarksTable.$inferSelect;
