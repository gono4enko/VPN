import { db, vpnServersTable, vpnProfilesTable, vpnUsersTable, routingRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { makeSignedRequest } from "../middleware/hmac-auth";
import { logger } from "../lib/logger";

interface SyncPayload {
  nodeId: number;
  timestamp: string;
  users: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  routingRules: Array<Record<string, unknown>>;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 60_000;

export async function collectSyncData(since?: Date): Promise<Omit<SyncPayload, "nodeId">> {
  const filter = since || new Date(0);
  
  const users = await db.select().from(vpnUsersTable);
  const profiles = await db.select().from(vpnProfilesTable);
  const rules = await db.select().from(routingRulesTable);

  return {
    timestamp: new Date().toISOString(),
    users: users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })),
    profiles: profiles.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      lastCheckAt: p.lastCheckAt?.toISOString() || null,
      lastFingerprintRotation: p.lastFingerprintRotation?.toISOString() || null,
    })),
    routingRules: rules.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

export async function applySyncData(payload: SyncPayload): Promise<{ applied: number }> {
  let applied = 0;

  for (const user of payload.users) {
    const existing = await db.select({ id: vpnUsersTable.id })
      .from(vpnUsersTable)
      .where(eq(vpnUsersTable.uuid, user.uuid as string));

    if (existing.length === 0) {
      await db.insert(vpnUsersTable).values({
        name: user.name as string,
        uuid: user.uuid as string,
        flow: (user.flow as string) || "xtls-rprx-vision",
        trafficLimit: (user.trafficLimit as number) || 0,
        status: (user.status as string) || "active",
      });
      applied++;
    }
  }

  for (const profile of payload.profiles) {
    const existing = await db.select({ id: vpnProfilesTable.id })
      .from(vpnProfilesTable)
      .where(eq(vpnProfilesTable.address, profile.address as string));

    const addressMatch = existing.find(() => true);
    if (!addressMatch) {
      await db.insert(vpnProfilesTable).values({
        name: profile.name as string,
        protocol: (profile.protocol as string) || "vless",
        address: profile.address as string,
        port: (profile.port as number) || 443,
        uuid: (profile.uuid as string) || "",
        flow: (profile.flow as string) || "",
        security: (profile.security as string) || "",
        sni: (profile.sni as string) || "",
        publicKey: (profile.publicKey as string) || "",
        shortId: (profile.shortId as string) || "",
        fingerprint: (profile.fingerprint as string) || "random",
        country: (profile.country as string) || "Unknown",
        countryFlag: (profile.countryFlag as string) || "🌐",
      });
      applied++;
    }
  }

  for (const rule of payload.routingRules) {
    const existing = await db.select({ id: routingRulesTable.id })
      .from(routingRulesTable)
      .where(eq(routingRulesTable.value, rule.value as string));

    if (existing.length === 0) {
      await db.insert(routingRulesTable).values({
        ruleType: (rule.ruleType as string) || "domain",
        value: rule.value as string,
        action: (rule.action as string) || "direct",
        description: (rule.description as string) || "",
        enabled: rule.enabled !== false,
        priority: (rule.priority as number) || 0,
        category: (rule.category as string) || "synced",
      });
      applied++;
    }
  }

  return { applied };
}

function normalizeSyncBaseUrl(syncUrl: string): string {
  let base = syncUrl.replace(/\/+$/, "");
  const suffixes = ["/api/cluster/sync/push", "/api/cluster/sync/pull", "/api/cluster/sync"];
  for (const suffix of suffixes) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base;
}

async function syncWithPeer(server: typeof vpnServersTable.$inferSelect): Promise<boolean> {
  if (!server.syncUrl || !server.syncSecret) return false;

  try {
    await db.update(vpnServersTable)
      .set({ syncStatus: "syncing" })
      .where(eq(vpnServersTable.id, server.id));

    const baseUrl = normalizeSyncBaseUrl(server.syncUrl);
    const data = await collectSyncData();
    const pushUrl = `${baseUrl}/api/cluster/sync/push`;

    const response = await makeSignedRequest(pushUrl, server.syncSecret, {
      nodeId: server.id,
      ...data,
    });

    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status}`);
    }

    const pullUrl = `${baseUrl}/api/cluster/sync/pull`;
    const pullResponse = await makeSignedRequest(pullUrl, server.syncSecret, {
      nodeId: server.id,
    });

    if (pullResponse.ok) {
      const pullData = await pullResponse.json() as SyncPayload;
      await applySyncData(pullData);
    }

    await db.update(vpnServersTable)
      .set({ syncStatus: "synced", lastSyncAt: new Date() })
      .where(eq(vpnServersTable.id, server.id));

    logger.info({ serverId: server.id, serverName: server.name }, "Sync completed with peer");
    return true;
  } catch (error) {
    await db.update(vpnServersTable)
      .set({ syncStatus: "error" })
      .where(eq(vpnServersTable.id, server.id));

    logger.error({ serverId: server.id, error: (error as Error).message }, "Sync failed with peer");
    return false;
  }
}

async function runSyncCycle(): Promise<void> {
  const servers = await db.select().from(vpnServersTable);
  const syncable = servers.filter(s => s.syncUrl && s.syncSecret && s.status !== "offline");

  for (const server of syncable) {
    await syncWithPeer(server);
  }
}

export function startClusterSync(): void {
  if (syncInterval) return;
  syncInterval = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
  logger.info("Cluster sync engine started (interval: 60s)");
}

export function stopClusterSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    logger.info("Cluster sync engine stopped");
  }
}

export async function triggerSyncNow(): Promise<{ synced: number; errors: number }> {
  const servers = await db.select().from(vpnServersTable);
  const syncable = servers.filter(s => s.syncUrl && s.syncSecret && s.status !== "offline");

  let synced = 0;
  let errors = 0;

  for (const server of syncable) {
    const ok = await syncWithPeer(server);
    if (ok) {
      synced++;
    } else {
      errors++;
    }
  }

  return { synced, errors };
}
