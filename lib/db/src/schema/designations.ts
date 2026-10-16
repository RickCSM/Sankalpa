import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const designationsTable = pgTable("designations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertDesignationSchema = createInsertSchema(designationsTable).omit({ id: true });
export type Designation = typeof designationsTable.$inferSelect;
export type InsertDesignation = typeof designationsTable.$inferInsert;
