import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
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
  lastDownloadSpeed: real("last_download_speed"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  isOnline: boolean("is_online").notNull().default(true),
  status: text("status").notNull().default("inactive"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpnProfileSchema = createInsertSchema(vpnProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVpnProfile = z.infer<typeof insertVpnProfileSchema>;
export type VpnProfile = typeof vpnProfilesTable.$inferSelect;
