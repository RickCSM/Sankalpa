import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";

// Per-account UI preferences that follow a user across devices/browsers.
// Currently holds only the Chief Minister's "show/hide Notifications" choice,
// but is modelled as a JSON object so future small preferences can be added
// without a schema migration. Unset keys fall back to their default at read time.
export interface UserPreferences {
  notificationsVisible?: boolean;
}

export const userRoles = [
  "admin",
  "chief_minister",
  "cmo_nodal",
  "cmo_reviewer",
  "ocac_viewer",
  "dept_head",
  "dept_nodal",
  "dept_reviewer",
  "dept_user",
  "dept_viewer",
] as const;

export type UserRole = (typeof userRoles)[number];

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().$type<UserRole>(),
    // Foreign key to departments.id with ON DELETE RESTRICT — a department
    // cannot be removed while users still reference it. The /departments DELETE
    // route surfaces this as a 409 to clients.
    departmentId: integer("department_id").references(() => departmentsTable.id, {
      onDelete: "restrict",
    }),
    email: text("email").notNull(),
    mobile: text("mobile"),
    // Normalized object-storage path to the user's uploaded profile photo,
    // e.g. "/objects/uploads/<uuid>". Null when the user has no photo, in
    // which case the UI falls back to an initials-based avatar.
    profileImagePath: text("profile_image_path"),
    status: text("status").notNull().default("Active").$type<"Active" | "Inactive">(),
    preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("users_role_idx").on(t.role),
    index("users_department_id_idx").on(t.departmentId),
  ],
);

export type User = typeof usersTable.$inferSelect;
