import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpnServerSchema = createInsertSchema(vpnServersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVpnServer = z.infer<typeof insertVpnServerSchema>;
export type VpnServer = typeof vpnServersTable.$inferSelect;
