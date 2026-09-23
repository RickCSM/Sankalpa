import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { categoriesTable } from "./categories";
import { usersTable } from "./users";

export const workflowStatuses = [
  "draft",
  "pending_cmo_review",
  "reverted_by_cmo",
  "pending_cmo_reconsideration",
  "published",
  "pending_dept_acceptance",
  "accepted",
  "in_progress",
  "pending_completion_review",
  "reverted_by_dept_reviewer",
  "pending_cmo_completion_review",
  "completed",
  "dropped",
  "on_hold",
] as const;

export type WorkflowStatus = (typeof workflowStatuses)[number];

export const houses = ["R", "L", "A"] as const;
export type House = (typeof houses)[number];

export const announcementsTable = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    uniqueId: text("unique_id").notNull().unique(),
    house: text("house").$type<House>(),
    constituencyNumber: integer("constituency_number"),
    title: text("title").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull().default(""),
    // Restrict deletion of departments referenced by announcements (matches
    // master-data 409 contract).
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    occasion: text("occasion").notNull().default(""),
    location: text("location").notNull().default(""),
    district: text("district"),
    block: text("block"),
    categoryId: integer("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    // Free-text category value captured when the selected category is "Other".
    // Categories are admin-managed master data that non-admins cannot extend, so
    // a custom "Other" value is stored on the announcement itself rather than as
    // a new master category. Null unless the category is "Other".
    otherCategory: text("other_category"),
    // Tags are short free-form strings; storing as a text array keeps the read
    // path a single-table query.
    tags: text("tags").array().notNull().default([]),
    // Files are managed via the announcement_attachments table.
    workflowStatus: text("workflow_status")
      .notNull()
      .$type<WorkflowStatus>()
      .default("draft"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    assignedDeptUserId: integer("assigned_dept_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    assignedCmoReviewerId: integer("assigned_cmo_reviewer_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    acceptedByDeptNodalId: integer("accepted_by_dept_nodal_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    // Parallel-state flag. When a Dept Nodal requests reconsideration on an
    // announcement that is already awaiting approval (pending_dept_acceptance),
    // the row stays in that approval status AND this flag is set, so it
    // surfaces in BOTH the Approval stage and the CMO Reconsideration queue.
    // Cleared when either side resolves the parallel state.
    reconsiderationRequested: boolean("reconsideration_requested")
      .notNull()
      .default(false),
    // When an announcement is put on hold, the workflow status it held
    // immediately beforehand is saved here so the "Resume" action can restore
    // it to exactly where it left off. Null unless currently on hold.
    statusBeforeHold: text("status_before_hold").$type<WorkflowStatus>(),
    // Optimistic-locking version. Every transactional workflow transition
    // re-reads the row, asserts the version, then writes with version+1.
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("announcements_dept_idx").on(t.departmentId),
    index("announcements_status_idx").on(t.workflowStatus),
    index("announcements_created_by_idx").on(t.createdBy),
    index("announcements_assigned_cmo_idx").on(t.assignedCmoReviewerId),
    index("announcements_accepted_by_idx").on(t.acceptedByDeptNodalId),
    index("announcements_date_idx").on(t.date),
  ],
);

export type Announcement = typeof announcementsTable.$inferSelect;
