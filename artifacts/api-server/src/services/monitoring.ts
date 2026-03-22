import { eq } from "drizzle-orm";
import { db, vpnProfilesTable, monitoringSettingsTable, switchEventLogTable } from "@workspace/db";
import { measureNode } from "./tcp-ping";

let monitoringTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt: string | null = null;
let isRunning = false;
let isChecking = false;

export function getMonitoringStatus() {
  return {
    isRunning,
    lastCheckAt,
  };
}

export async function getOrCreateSettings() {
  const rows = await db.select().from(monitoringSettingsTable);
  if (rows.length > 0) return rows[0];

  const [settings] = await db.insert(monitoringSettingsTable).values({}).returning();
  return settings;
}

export async function updateSettings(data: {
  enabled?: boolean;
  intervalSeconds?: number;
  pingThresholdMs?: number;
  autoSwitchEnabled?: boolean;
}) {
  if (data.intervalSeconds !== undefined && data.intervalSeconds < 10) {
    data.intervalSeconds = 10;
  }
  if (data.pingThresholdMs !== undefined && data.pingThresholdMs < 50) {
    data.pingThresholdMs = 50;
  }

  const settings = await getOrCreateSettings();
  const [updated] = await db
    .update(monitoringSettingsTable)
    .set(data)
    .where(eq(monitoringSettingsTable.id, settings.id))
    .returning();

  if (updated.enabled && !isRunning) {
    await startMonitoring();
  } else if (!updated.enabled && isRunning) {
    stopMonitoring();
  } else if (updated.enabled && isRunning) {
    stopMonitoring();
    await startMonitoring();
  }

  return updated;
}

async function runCheck() {
  if (isChecking) return;
  isChecking = true;

  try {
    const profiles = await db.select().from(vpnProfilesTable);
    const settings = await getOrCreateSettings();

    for (const profile of profiles) {
      const result = await measureNode(
        profile.address,
        profile.port,
        profile.security || undefined,
        profile.sni || undefined
      );

      await db
        .update(vpnProfilesTable)
        .set({
          lastPing: result.ping,
          lastDownloadSpeed: result.downloadSpeed,
          lastCheckAt: new Date(),
          isOnline: result.isOnline,
          status: profile.isActive ? (result.isOnline ? "active" : "degraded") : (result.isOnline ? "inactive" : "offline"),
        })
        .where(eq(vpnProfilesTable.id, profile.id));
    }

    lastCheckAt = new Date().toISOString();

    if (settings.autoSwitchEnabled) {
      const activeProfile = profiles.find((p) => p.isActive);
      if (activeProfile) {
        const updatedActive = await db
          .select()
          .from(vpnProfilesTable)
          .where(eq(vpnProfilesTable.id, activeProfile.id));

        const current = updatedActive[0];
        const needsSwitch =
          current &&
          (!current.isOnline ||
            (current.lastPing !== null && current.lastPing > settings.pingThresholdMs));

        if (needsSwitch) {
          const allUpdated = await db.select().from(vpnProfilesTable);
          const onlineProfiles = allUpdated
            .filter((p) => p.isOnline && p.lastPing !== null && p.id !== current.id)
            .sort((a, b) => (a.lastPing || 9999) - (b.lastPing || 9999));

          if (onlineProfiles.length > 0) {
            const best = onlineProfiles[0];

            await db
              .update(vpnProfilesTable)
              .set({ isActive: false })
              .where(eq(vpnProfilesTable.isActive, true));
            await db
              .update(vpnProfilesTable)
              .set({ isActive: true, status: "active" })
              .where(eq(vpnProfilesTable.id, best.id));

            const reason = !current.isOnline
              ? `Node ${current.name} went offline`
              : `Node ${current.name} ping ${current.lastPing}ms exceeded threshold ${settings.pingThresholdMs}ms`;

            await db.insert(switchEventLogTable).values({
              fromProfileId: current.id,
              fromProfileName: `${current.countryFlag} ${current.name}`,
              toProfileId: best.id,
              toProfileName: `${best.countryFlag} ${best.name}`,
              reason,
            });
          }
        }
      }
    }
  } finally {
    isChecking = false;
  }
}

export async function startMonitoring() {
  if (isRunning) return;

  const settings = await getOrCreateSettings();

  await db
    .update(monitoringSettingsTable)
    .set({ enabled: true })
    .where(eq(monitoringSettingsTable.id, settings.id));

  isRunning = true;

  runCheck().catch(console.error);

  monitoringTimer = setInterval(() => {
    runCheck().catch(console.error);
  }, settings.intervalSeconds * 1000);
}

export async function stopMonitoring() {
  if (monitoringTimer) {
    clearInterval(monitoringTimer);
    monitoringTimer = null;
  }
  isRunning = false;

  const settings = await getOrCreateSettings();
  await db
    .update(monitoringSettingsTable)
    .set({ enabled: false })
    .where(eq(monitoringSettingsTable.id, settings.id));
}

export async function initMonitoringOnBoot() {
  try {
    const settings = await getOrCreateSettings();
    if (settings.enabled) {
      console.log("Auto-starting monitoring from persisted settings");
      await startMonitoring();
    }
  } catch (err) {
    console.error("Failed to init monitoring on boot:", err);
  }
}

export async function getSwitchEvents(limit = 50) {
  const events = await db
    .select()
    .from(switchEventLogTable)
    .orderBy(switchEventLogTable.createdAt)
    .limit(limit);

  return events.reverse();
}
