import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    // Nullable: anonymous events such as `auth.login_failed` have no actor.
    actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").notNull(),
    method: text("method").notNull(),
    route: text("route").notNull(),
    action: text("action").notNull(),
    targetTable: text("target_table").notNull(),
    targetId: integer("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_target_idx").on(t.targetTable, t.targetId),
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_actor_role_idx").on(t.actorRole),
  ],
);

export type AuditLogRow = typeof auditLogTable.$inferSelect;
