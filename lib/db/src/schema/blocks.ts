import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { districtsTable } from "./districts";

export const blocksTable = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    districtId: integer("district_id")
      .notNull()
      .references(() => districtsTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    districtNameUq: uniqueIndex("blocks_district_name_uq").on(t.districtId, t.name),
    districtIdx: index("blocks_district_idx").on(t.districtId),
  }),
);

export type Block = typeof blocksTable.$inferSelect;
