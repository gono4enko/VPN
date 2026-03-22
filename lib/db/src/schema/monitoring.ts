import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { vpnProfilesTable } from "./vpn-profiles";

export const monitoringSettingsTable = pgTable("monitoring_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  pingThresholdMs: integer("ping_threshold_ms").notNull().default(500),
  autoSwitchEnabled: boolean("auto_switch_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const switchEventLogTable = pgTable("switch_event_log", {
  id: serial("id").primaryKey(),
  fromProfileId: integer("from_profile_id"),
  fromProfileName: text("from_profile_name"),
  toProfileId: integer("to_profile_id").notNull(),
  toProfileName: text("to_profile_name").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MonitoringSettings = typeof monitoringSettingsTable.$inferSelect;
export type SwitchEventLog = typeof switchEventLogTable.$inferSelect;
