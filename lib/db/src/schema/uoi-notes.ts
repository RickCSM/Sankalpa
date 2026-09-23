import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

export const uoiNotesTable = pgTable(
  "uoi_notes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    date: text("date").notNull(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    occasion: text("occasion"),
    location: text("location"),
    description: text("description").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("uoi_notes_dept_idx").on(t.departmentId),
    index("uoi_notes_date_idx").on(t.date),
  ],
);

export type UoiNote = typeof uoiNotesTable.$inferSelect;
