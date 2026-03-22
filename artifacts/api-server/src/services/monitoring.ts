import { eq, sql } from "drizzle-orm";
import { db, vpnProfilesTable, monitoringSettingsTable, switchEventLogTable } from "@workspace/db";
import { tcpPing } from "./tcp-ping";

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let isCheckInProgress = false;

export function isMonitoringRunning() {
  return isRunning;
}

export async function getOrCreateSettings() {
  const rows = await db.select().from(monitoringSettingsTable);
  if (rows.length > 0) return rows[0];

  const [settings] = await db.insert(monitoringSettingsTable).values({
    enabled: false,
    intervalSeconds: 60,
    pingThresholdMs: 500,
    autoSwitch: true,
  }).returning();
  return settings;
}

export async function runMonitoringCheck() {
  if (isCheckInProgress) return;
  isCheckInProgress = true;

  try {
    const settings = await getOrCreateSettings();
    const profiles = await db.select().from(vpnProfilesTable);

    if (profiles.length === 0) return;

    for (const profile of profiles) {
      try {
        const result = await tcpPing(profile.address, profile.port);

        await db.update(vpnProfilesTable).set({
          lastPing: result.latencyMs,
          lastDownloadSpeed: result.tlsEstimateMs ? Math.round((1000 / result.tlsEstimateMs) * 100) / 100 : null,
          lastCheckAt: new Date(),
          isOnline: result.reachable,
          status: result.reachable
            ? (profile.isActive ? "active" : "inactive")
            : "offline",
        }).where(eq(vpnProfilesTable.id, profile.id));
      } catch (err) {
        console.error(`TCP ping failed for profile ${profile.id}:`, err);
        await db.update(vpnProfilesTable).set({
          lastCheckAt: new Date(),
          isOnline: false,
          status: "offline",
        }).where(eq(vpnProfilesTable.id, profile.id));
      }
    }

    await db.update(monitoringSettingsTable).set({ lastCheckAt: new Date() }).where(eq(monitoringSettingsTable.id, settings.id));

    if (!settings.autoSwitch) return;

    const updatedProfiles = await db.select().from(vpnProfilesTable);
    const activeProfile = updatedProfiles.find(p => p.isActive);

    const needSwitch =
      !activeProfile ||
      !activeProfile.isOnline ||
      (activeProfile.lastPing !== null && activeProfile.lastPing > settings.pingThresholdMs);

    if (!needSwitch) return;

    const onlineProfiles = updatedProfiles
      .filter(p => p.isOnline && p.lastPing !== null)
      .sort((a, b) => (a.lastPing ?? 9999) - (b.lastPing ?? 9999));

    if (onlineProfiles.length === 0) return;

    const best = onlineProfiles[0];
    if (activeProfile && best.id === activeProfile.id) return;

    await db.update(vpnProfilesTable).set({ isActive: false }).where(eq(vpnProfilesTable.isActive, true));
    await db.update(vpnProfilesTable).set({ isActive: true, status: "active" }).where(eq(vpnProfilesTable.id, best.id));

    let reason = "";
    if (!activeProfile) {
      reason = "Нет активного профиля";
    } else if (!activeProfile.isOnline) {
      reason = "Активный узел недоступен";
    } else {
      reason = `Превышен порог задержки (${activeProfile.lastPing}мс > ${settings.pingThresholdMs}мс)`;
    }

    await db.insert(switchEventLogTable).values({
      fromProfileId: activeProfile?.id ?? null,
      fromProfileName: activeProfile ? `${activeProfile.countryFlag} ${activeProfile.name}` : null,
      toProfileId: best.id,
      toProfileName: `${best.countryFlag} ${best.name}`,
      reason,
      pingBefore: activeProfile?.lastPing ?? null,
      pingAfter: best.lastPing,
    });
  } finally {
    isCheckInProgress = false;
  }
}

export async function startMonitoring() {
  if (isRunning) return;

  const settings = await getOrCreateSettings();
  await db.update(monitoringSettingsTable).set({ enabled: true }).where(eq(monitoringSettingsTable.id, settings.id));

  isRunning = true;

  await runMonitoringCheck();

  monitorInterval = setInterval(async () => {
    try {
      const currentSettings = await getOrCreateSettings();
      if (!currentSettings.enabled) {
        await stopMonitoring();
        return;
      }
      await runMonitoringCheck();
    } catch (err) {
      console.error("Monitoring check error:", err);
    }
  }, settings.intervalSeconds * 1000);
}

export async function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;

  await db.update(monitoringSettingsTable).set({ enabled: false }).where(sql`true`);
}

export async function restartMonitoringWithNewInterval() {
  if (!isRunning) return;
  await stopMonitoring();
  await startMonitoring();
}
