import { pgTable, text, serial, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vpnUsersTable = pgTable("vpn_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  uuid: text("uuid").notNull().unique(),
  flow: text("flow").notNull().default("xtls-rprx-vision"),
  trafficLimit: real("traffic_limit").notNull().default(0),
  trafficUsed: real("traffic_used").notNull().default(0),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVpnUserSchema = createInsertSchema(vpnUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVpnUser = z.infer<typeof insertVpnUserSchema>;
export type VpnUser = typeof vpnUsersTable.$inferSelect;
