import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const syncChangelogTable = pgTable("sync_changelog", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  sourceNodeId: text("source_node_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSyncChangelogSchema = createInsertSchema(syncChangelogTable).omit({ id: true, createdAt: true });
export type InsertSyncChangelog = z.infer<typeof insertSyncChangelogSchema>;
export type SyncChangelog = typeof syncChangelogTable.$inferSelect;
