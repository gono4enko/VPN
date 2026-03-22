import { pgTable, text, serial, timestamp, integer, boolean, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vpnProfilesTable = pgTable("vpn_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  protocol: text("protocol").notNull().default("vless"),
  address: text("address").notNull(),
  port: integer("port").notNull().default(443),
  uuid: text("uuid").notNull().default(""),
  flow: text("flow").notNull().default(""),
  security: text("security").notNull().default("reality"),
  sni: text("sni").notNull().default(""),
  publicKey: text("public_key").notNull().default(""),
  shortId: text("short_id").notNull().default(""),
  fingerprint: text("fingerprint").notNull().default("random"),
  country: text("country").notNull().default("Unknown"),
  countryFlag: text("country_flag").notNull().default("🌐"),
  isActive: boolean("is_active").notNull().default(false),
  lastPing: integer("last_ping"),
  lastDownloadSpeed: integer("last_download_speed"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  isOnline: boolean("is_online").notNull().default(true),
  status: text("status").notNull().default("inactive"),
  transportType: text("transport_type").notNull().default("tcp"),
  transportPath: text("transport_path").notNull().default(""),
  transportHost: text("transport_host").notNull().default(""),
  fragmentEnabled: boolean("fragment_enabled").notNull().default(true),
  fragmentLength: text("fragment_length").notNull().default("100-200"),
  fragmentInterval: text("fragment_interval").notNull().default("10-20"),
  fingerprintRotation: boolean("fingerprint_rotation").notNull().default(true),
  fingerprintInterval: integer("fingerprint_interval").notNull().default(360),
  fingerprintList: jsonb("fingerprint_list").notNull().$type<string[]>().default(["chrome", "firefox", "safari", "edge", "random"]),
  lastFingerprintRotation: timestamp("last_fingerprint_rotation", { withTimezone: true }),
  transportPriority: jsonb("transport_priority").notNull().$type<string[]>().default(["tcp", "ws", "grpc", "h2"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpnProfileSchema = createInsertSchema(vpnProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVpnProfile = z.infer<typeof insertVpnProfileSchema>;
export type VpnProfile = typeof vpnProfilesTable.$inferSelect;
