import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  getMonitoringStatus,
  getOrCreateSettings,
  updateSettings,
  startMonitoring,
  stopMonitoring as stopMonitoringService,
  getSwitchEvents,
  runCheckNow,
} from "../services/monitoring";

const router: IRouter = Router();

router.get("/monitoring/settings", authMiddleware, async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    id: settings.id,
    enabled: settings.enabled,
    intervalSeconds: settings.intervalSeconds,
    pingThresholdMs: settings.pingThresholdMs,
    autoSwitchEnabled: settings.autoSwitchEnabled,
  });
});

router.put("/monitoring/settings", authMiddleware, async (req, res): Promise<void> => {
  const { enabled, intervalSeconds, pingThresholdMs, autoSwitchEnabled } = req.body;
  const data: Record<string, unknown> = {};
  if (enabled !== undefined) data.enabled = enabled;
  if (intervalSeconds !== undefined) data.intervalSeconds = intervalSeconds;
  if (pingThresholdMs !== undefined) data.pingThresholdMs = pingThresholdMs;
  if (autoSwitchEnabled !== undefined) data.autoSwitchEnabled = autoSwitchEnabled;

  const settings = await updateSettings(data as {
    enabled?: boolean;
    intervalSeconds?: number;
    pingThresholdMs?: number;
    autoSwitchEnabled?: boolean;
  });

  res.json({
    id: settings.id,
    enabled: settings.enabled,
    intervalSeconds: settings.intervalSeconds,
    pingThresholdMs: settings.pingThresholdMs,
    autoSwitchEnabled: settings.autoSwitchEnabled,
  });
});

router.get("/monitoring/status", authMiddleware, async (_req, res): Promise<void> => {
  const status = getMonitoringStatus();
  const settings = await getOrCreateSettings();

  res.json({
    isRunning: status.isRunning,
    lastCheckAt: status.lastCheckAt,
    settings: {
      id: settings.id,
      enabled: settings.enabled,
      intervalSeconds: settings.intervalSeconds,
      pingThresholdMs: settings.pingThresholdMs,
      autoSwitchEnabled: settings.autoSwitchEnabled,
    },
  });
});

router.post("/monitoring/start", authMiddleware, async (_req, res): Promise<void> => {
  await startMonitoring();
  res.json({ message: "Monitoring started" });
});

router.post("/monitoring/stop", authMiddleware, async (_req, res): Promise<void> => {
  await stopMonitoringService();
  res.json({ message: "Monitoring stopped" });
});

router.post("/monitoring/check-now", authMiddleware, async (_req, res): Promise<void> => {
  await runCheckNow();
  res.json({ message: "Check completed" });
});

router.get("/monitoring/events", authMiddleware, async (_req, res): Promise<void> => {
  const events = await getSwitchEvents();
  res.json(events.map(e => ({
    id: e.id,
    fromProfileId: e.fromProfileId,
    fromProfileName: e.fromProfileName,
    toProfileId: e.toProfileId,
    toProfileName: e.toProfileName,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  })));
});

export default router;
