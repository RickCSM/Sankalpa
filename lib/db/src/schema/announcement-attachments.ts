import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { announcementsTable } from "./announcements";
import { usersTable } from "./users";

export const announcementAttachmentsTable = pgTable(
  "announcement_attachments",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("announcement_attachments_announcement_idx").on(t.announcementId),
    uniqueIndex("announcement_attachments_object_path_uq").on(t.objectPath),
  ],
);

export type AnnouncementAttachmentRow = typeof announcementAttachmentsTable.$inferSelect;
