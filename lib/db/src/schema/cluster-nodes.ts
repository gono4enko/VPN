import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clusterNodesTable = pgTable("cluster_nodes", {
  id: serial("id").primaryKey(),
  nodeId: text("node_id").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  port: integer("port").notNull().default(443),
  apiPort: integer("api_port").notNull().default(3000),
  clusterSecretHash: text("cluster_secret_hash").notNull(),
  status: text("status").notNull().default("offline"),
  latency: integer("latency"),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncStatus: text("sync_status").notNull().default("pending"),
  failCount: integer("fail_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClusterNodeSchema = createInsertSchema(clusterNodesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClusterNode = z.infer<typeof insertClusterNodeSchema>;
export type ClusterNode = typeof clusterNodesTable.$inferSelect;
