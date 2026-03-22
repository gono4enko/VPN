import { db, vpnProfilesTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { VpnProfile } from "@workspace/db/schema";
import { logger } from "./logger";

const VALID_TRANSPORTS = ["tcp", "ws", "grpc", "h2"];
const VALID_FINGERPRINTS = [
  "chrome", "firefox", "safari", "edge", "ios", "android",
  "randomized", "random",
];

const CHECK_INTERVAL_MS = 60_000;
const FALLBACK_CHECK_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 120_000;

let monitorRunning = false;
let autoFallbackEnabled = true;

const profileFailures: Map<number, { count: number; firstFailure: number }> = new Map();

export function setAutoFallback(enabled: boolean) {
  autoFallbackEnabled = enabled;
}

export function getAutoFallback() {
  return autoFallbackEnabled;
}

export function isValidTransport(t: string): boolean {
  return VALID_TRANSPORTS.includes(t);
}

export function isValidFingerprint(fp: string): boolean {
  return VALID_FINGERPRINTS.includes(fp);
}

export function recordConnectionFailure(profileId: number) {
  const now = Date.now();
  const existing = profileFailures.get(profileId);

  if (existing && now - existing.firstFailure < FAILURE_WINDOW_MS) {
    existing.count++;
  } else {
    profileFailures.set(profileId, { count: 1, firstFailure: now });
  }
}

export function resetConnectionFailures(profileId: number) {
  profileFailures.delete(profileId);
}

export async function rotateFingerprint(profile: VpnProfile): Promise<{ previous: string; next: string }> {
  const list = ((profile.fingerprintList as string[]) || VALID_FINGERPRINTS).filter(isValidFingerprint);
  if (list.length === 0) list.push("random");
  const currentIdx = list.indexOf(profile.fingerprint);
  const nextIdx = (currentIdx + 1) % list.length;
  const newFingerprint = list[nextIdx] || "random";

  await db.update(vpnProfilesTable).set({
    fingerprint: newFingerprint,
    lastFingerprintRotation: new Date(),
  }).where(eq(vpnProfilesTable.id, profile.id));

  await db.insert(auditLogsTable).values({
    action: "fingerprint_rotation",
    details: `Profile "${profile.name}" (ID:${profile.id}): ${profile.fingerprint} → ${newFingerprint}`,
  });

  return { previous: profile.fingerprint, next: newFingerprint };
}

export async function switchTransport(profile: VpnProfile): Promise<{ previous: string; next: string }> {
  const priority = ((profile.transportPriority as string[]) || VALID_TRANSPORTS).filter(isValidTransport);
  if (priority.length === 0) priority.push("tcp");
  const currentIdx = priority.indexOf(profile.transportType);
  const nextIdx = (currentIdx + 1) % priority.length;
  const newTransport = priority[nextIdx] || "tcp";

  await db.update(vpnProfilesTable).set({
    transportType: newTransport,
  }).where(eq(vpnProfilesTable.id, profile.id));

  await db.insert(auditLogsTable).values({
    action: "transport_fallback",
    details: `Profile "${profile.name}" (ID:${profile.id}): ${profile.transportType} → ${newTransport} (auto-fallback)`,
  });

  resetConnectionFailures(profile.id);

  return { previous: profile.transportType, next: newTransport };
}

async function checkFingerprintRotations() {
  try {
    const profiles = await db.select().from(vpnProfilesTable);
    const now = Date.now();

    for (const profile of profiles) {
      if (!profile.fingerprintRotation) continue;

      const intervalMs = (profile.fingerprintInterval || 360) * 60_000;
      const lastRotation = profile.lastFingerprintRotation
        ? new Date(profile.lastFingerprintRotation).getTime()
        : 0;

      if (now - lastRotation >= intervalMs) {
        const result = await rotateFingerprint(profile);
        logger.info({ profileId: profile.id, ...result }, "Auto-rotated fingerprint");
      }
    }
  } catch (err) {
    logger.error({ err }, "Fingerprint rotation check failed");
  }
}

async function checkTransportFallback() {
  if (!autoFallbackEnabled) return;

  try {
    const profiles = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.isActive, true));
    const now = Date.now();

    for (const profile of profiles) {
      const failures = profileFailures.get(profile.id);
      if (!failures) continue;

      if (now - failures.firstFailure > FAILURE_WINDOW_MS) {
        profileFailures.delete(profile.id);
        continue;
      }

      if (failures.count >= FAILURE_THRESHOLD) {
        logger.warn(
          { profileId: profile.id, failureCount: failures.count },
          "Transport failure threshold reached, initiating auto-fallback"
        );
        const result = await switchTransport(profile);
        logger.info(
          { profileId: profile.id, ...result },
          "Auto-fallback: transport switched"
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "Transport fallback check failed");
  }
}

async function simulateConnectionHealthCheck() {
  if (!autoFallbackEnabled) return;

  try {
    const profiles = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.isActive, true));

    for (const profile of profiles) {
      const isReachable = await simulatePingCheck(profile);
      if (!isReachable) {
        recordConnectionFailure(profile.id);
        logger.debug(
          { profileId: profile.id, transport: profile.transportType },
          "Connection check failed, failure recorded"
        );
      } else {
        resetConnectionFailures(profile.id);
      }
    }
  } catch (err) {
    logger.error({ err }, "Connection health check failed");
  }
}

async function simulatePingCheck(profile: VpnProfile): Promise<boolean> {
  try {
    const net = await import("node:net");
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = 5000;

      socket.setTimeout(timeout);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(profile.port, profile.address);
    });
  } catch {
    return false;
  }
}

export function startMonitor() {
  if (monitorRunning) return;
  monitorRunning = true;

  setInterval(async () => {
    await checkFingerprintRotations();
  }, CHECK_INTERVAL_MS);

  setInterval(async () => {
    await simulateConnectionHealthCheck();
    await checkTransportFallback();
  }, FALLBACK_CHECK_INTERVAL_MS);

  logger.info("Anti-DPI monitor started (fingerprint rotation + transport fallback)");
}
