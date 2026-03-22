import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, switchEventLogTable } from "@workspace/db";
import {
  getOrCreateSettings,
  startMonitoring,
  stopMonitoring,
  runMonitoringCheck,
  isMonitoringRunning,
  restartMonitoringWithNewInterval,
} from "../services/monitoring";

const router: IRouter = Router();

router.get("/monitoring/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    enabled: settings.enabled,
    intervalSeconds: settings.intervalSeconds,
    pingThresholdMs: settings.pingThresholdMs,
    autoSwitch: settings.autoSwitch,
    lastCheckAt: settings.lastCheckAt?.toISOString() ?? null,
    isRunning: isMonitoringRunning(),
  });
});

router.put("/monitoring/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const { intervalSeconds, pingThresholdMs, autoSwitch } = req.body;

  const updateData: Record<string, unknown> = {};
  if (intervalSeconds !== undefined) updateData.intervalSeconds = Math.max(10, Math.min(3600, intervalSeconds));
  if (pingThresholdMs !== undefined) updateData.pingThresholdMs = Math.max(50, Math.min(10000, pingThresholdMs));
  if (autoSwitch !== undefined) updateData.autoSwitch = autoSwitch;

  const { eq } = await import("drizzle-orm");
  const { monitoringSettingsTable } = await import("@workspace/db");
  await db.update(monitoringSettingsTable).set(updateData).where(eq(monitoringSettingsTable.id, settings.id));

  if (intervalSeconds !== undefined && isMonitoringRunning()) {
    await restartMonitoringWithNewInterval();
  }

  const updated = await getOrCreateSettings();
  res.json({
    enabled: updated.enabled,
    intervalSeconds: updated.intervalSeconds,
    pingThresholdMs: updated.pingThresholdMs,
    autoSwitch: updated.autoSwitch,
    lastCheckAt: updated.lastCheckAt?.toISOString() ?? null,
    isRunning: isMonitoringRunning(),
  });
});

router.post("/monitoring/start", async (_req, res): Promise<void> => {
  await startMonitoring();
  res.json({ message: "Мониторинг запущен", isRunning: true });
});

router.post("/monitoring/stop", async (_req, res): Promise<void> => {
  stopMonitoring();
  res.json({ message: "Мониторинг остановлен", isRunning: false });
});

router.post("/monitoring/check-now", async (_req, res): Promise<void> => {
  await runMonitoringCheck();
  res.json({ message: "Проверка выполнена" });
});

router.get("/monitoring/events", async (_req, res): Promise<void> => {
  const events = await db.select().from(switchEventLogTable).orderBy(desc(switchEventLogTable.createdAt)).limit(50);
  res.json(events.map(e => ({
    id: e.id,
    fromProfileId: e.fromProfileId,
    fromProfileName: e.fromProfileName,
    toProfileId: e.toProfileId,
    toProfileName: e.toProfileName,
    reason: e.reason,
    pingBefore: e.pingBefore,
    pingAfter: e.pingAfter,
    createdAt: e.createdAt.toISOString(),
  })));
});

export default router;
