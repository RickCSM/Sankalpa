import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { announcementsTable } from "./announcements";
import { usersTable } from "./users";

export const subComponentStatuses = ["Pending", "In Progress", "Completed"] as const;
export type SubComponentStatus = (typeof subComponentStatuses)[number];

export const subComponentsTable = pgTable(
  "sub_components",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assignedTo: integer("assigned_to").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().$type<SubComponentStatus>().default("Pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sub_components_announcement_idx").on(t.announcementId),
    index("sub_components_assigned_idx").on(t.assignedTo),
  ],
);

export type SubComponentRow = typeof subComponentsTable.$inferSelect;
