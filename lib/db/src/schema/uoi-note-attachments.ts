import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { uoiNotesTable } from "./uoi-notes";
import { usersTable } from "./users";

export const uoiNoteAttachmentsTable = pgTable(
  "uoi_note_attachments",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .notNull()
      .references(() => uoiNotesTable.id, { onDelete: "cascade" }),
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
    index("uoi_note_attachments_note_idx").on(t.noteId),
    uniqueIndex("uoi_note_attachments_object_path_uq").on(t.objectPath),
  ],
);

export type UoiNoteAttachmentRow = typeof uoiNoteAttachmentsTable.$inferSelect;
