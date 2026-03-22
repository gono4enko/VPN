import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const routingRulesTable = pgTable("routing_rules", {
  id: serial("id").primaryKey(),
  ruleType: text("rule_type").notNull().default("domain"),
  value: text("value").notNull(),
  action: text("action").notNull().default("direct"),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  category: text("category").notNull().default("custom"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRoutingRuleSchema = createInsertSchema(routingRulesTable).omit({ id: true, createdAt: true });
export type InsertRoutingRule = z.infer<typeof insertRoutingRuleSchema>;
export type RoutingRule = typeof routingRulesTable.$inferSelect;
