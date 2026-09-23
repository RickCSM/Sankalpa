import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Schema mirrors the table that connect-pg-simple expects (and creates with
 * `createTableIfMissing: true`). It is declared here so that drizzle-kit
 * keeps it in sync rather than dropping it on `push`.
 */
export const sessionsTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);
