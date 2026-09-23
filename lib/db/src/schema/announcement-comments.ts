import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { announcementsTable } from "./announcements";
import { usersTable } from "./users";

export const announcementCommentsTable = pgTable(
  "announcement_comments",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("announcement_comments_announcement_idx").on(t.announcementId)],
);

export type AnnouncementCommentRow = typeof announcementCommentsTable.$inferSelect;
