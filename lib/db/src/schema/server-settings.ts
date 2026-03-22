import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const serverSettingsTable = pgTable("server_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ServerSetting = typeof serverSettingsTable.$inferSelect;
