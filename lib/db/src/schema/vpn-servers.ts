import { pgTable, text, serial, timestamp, integer, boolean, real, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vpnServersTable = pgTable("vpn_servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  port: integer("port").notNull().default(443),
  country: text("country").notNull().default("Unknown"),
  countryFlag: text("country_flag").notNull().default("🌐"),
  provider: text("provider").notNull().default(""),
  status: text("status").notNull().default("offline"),
  lastPing: integer("last_ping"),
  cpuUsage: real("cpu_usage"),
  memUsage: real("mem_usage"),
  bandwidthUsed: real("bandwidth_used").notNull().default(0),
  bandwidthLimit: real("bandwidth_limit").notNull().default(0),
  connectedClients: integer("connected_clients").notNull().default(0),
  maxClients: integer("max_clients").notNull().default(100),
  isPrimary: boolean("is_primary").notNull().default(false),
  syncUrl: text("sync_url"),
  syncSecret: text("sync_secret"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncStatus: text("sync_status").notNull().default("idle"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpnServerSchema = createInsertSchema(vpnServersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVpnServer = z.infer<typeof insertVpnServerSchema>;
export type VpnServer = typeof vpnServersTable.$inferSelect;

export const trafficSnapshotsTable = pgTable("traffic_snapshots", {
  id: serial("id").primaryKey(),
  inboundBytes: bigint("inbound_bytes", { mode: "number" }).notNull().default(0),
  outboundBytes: bigint("outbound_bytes", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
