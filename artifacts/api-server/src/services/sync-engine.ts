import crypto from "crypto";
import { db, clusterNodesTable, syncChangelogTable, vpnUsersTable, vpnProfilesTable } from "@workspace/db";
import { eq, gt, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const LOCAL_NODE_ID = process.env.CLUSTER_NODE_ID || `node-${crypto.randomBytes(4).toString("hex")}`;
const CLUSTER_SECRET = process.env.CLUSTER_SECRET || "";

let syncInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let syncIntervalMs = 30000;
let heartbeatIntervalMs = 15000;
let autoSync = true;
let clusterEnabled = false;
let localNodeName = process.env.CLUSTER_NODE_NAME || "Local Node";

export function getLocalNodeId(): string {
  return LOCAL_NODE_ID;
}

export function getClusterSecret(): string {
  return CLUSTER_SECRET;
}

export function generateHmac(payload: string, secret?: string): string {
  return crypto.createHmac("sha256", secret || CLUSTER_SECRET).update(payload).digest("hex");
}

export function verifyHmac(payload: string, signature: string, secretHash?: string): boolean {
  if (!CLUSTER_SECRET) return false;
  if (secretHash) {
    const clusterSecretHashCheck = crypto.createHash("sha256").update(CLUSTER_SECRET).digest("hex");
    if (clusterSecretHashCheck !== secretHash) return false;
  }
  const expected = generateHmac(payload);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyIncomingRequest(nodeId: string, timestamp: string, signature: string): { valid: boolean; error?: string } {
  if (!CLUSTER_SECRET) {
    return { valid: false, error: "Cluster secret not configured on this node" };
  }

  const tsMs = new Date(timestamp).getTime();
  const now = Date.now();
  const MAX_DRIFT_MS = 5 * 60 * 1000;
  if (Math.abs(now - tsMs) > MAX_DRIFT_MS) {
    return { valid: false, error: "Timestamp too far from server time" };
  }

  const payload = `${nodeId}:${timestamp}`;
  const valid = verifyHmac(payload, signature);
  if (!valid) {
    return { valid: false, error: "Invalid HMAC signature" };
  }

  return { valid: true };
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export async function recordChange(
  entityType: string,
  entityId: string,
  action: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(syncChangelogTable).values({
      entityType,
      entityId,
      action,
      data: data ?? null,
      sourceNodeId: LOCAL_NODE_ID,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to record sync change");
  }
}

export async function getChangesSince(since: Date): Promise<Array<{
  entityType: string;
  entityId: string;
  action: string;
  data: Record<string, unknown> | null;
  timestamp: string;
  sourceNodeId: string;
}>> {
  const changes = await db.select().from(syncChangelogTable)
    .where(gt(syncChangelogTable.timestamp, since))
    .orderBy(syncChangelogTable.timestamp);

  return changes.map((c) => ({
    entityType: c.entityType,
    entityId: c.entityId,
    action: c.action,
    data: c.data ?? null,
    timestamp: c.timestamp.toISOString(),
    sourceNodeId: c.sourceNodeId,
  }));
}

export async function applyRemoteChanges(changes: Array<{
  entityType: string;
  entityId: string;
  action: string;
  data?: Record<string, unknown> | null;
  timestamp: string;
  sourceNodeId: string;
}>): Promise<{ accepted: number; rejected: number; conflicts: number }> {
  let accepted = 0;
  let rejected = 0;
  let conflicts = 0;

  for (const change of changes) {
    try {
      const existing = await db.select().from(syncChangelogTable)
        .where(and(
          eq(syncChangelogTable.entityId, change.entityId),
          eq(syncChangelogTable.entityType, change.entityType),
        ))
        .orderBy(desc(syncChangelogTable.timestamp))
        .limit(1);

      if (existing.length > 0) {
        const existingTime = existing[0].timestamp.getTime();
        const incomingTime = new Date(change.timestamp).getTime();
        if (incomingTime <= existingTime) {
          conflicts++;
          continue;
        }
      }

      if (change.entityType === "vpn_user" && change.data) {
        if (change.action === "create" || change.action === "update") {
          const existingUsers = await db.select().from(vpnUsersTable)
            .where(eq(vpnUsersTable.uuid, change.entityId));

          if (existingUsers.length > 0) {
            await db.update(vpnUsersTable).set({
              name: change.data.name as string,
              trafficLimit: change.data.trafficLimit as number,
              trafficUsed: change.data.trafficUsed as number,
              status: change.data.status as string,
            }).where(eq(vpnUsersTable.uuid, change.entityId));
          } else {
            await db.insert(vpnUsersTable).values({
              name: change.data.name as string,
              uuid: change.entityId,
              flow: (change.data.flow as string) || "xtls-rprx-vision",
              trafficLimit: (change.data.trafficLimit as number) || 0,
              trafficUsed: (change.data.trafficUsed as number) || 0,
              status: (change.data.status as string) || "active",
            });
          }
        } else if (change.action === "delete") {
          await db.delete(vpnUsersTable).where(eq(vpnUsersTable.uuid, change.entityId));
        }
      }

      if (change.entityType === "vpn_profile") {
        if ((change.action === "create" || change.action === "update") && change.data) {
          const profileId = parseInt(change.entityId, 10);
          if (!isNaN(profileId)) {
            const existingProfiles = await db.select().from(vpnProfilesTable)
              .where(eq(vpnProfilesTable.id, profileId));
            if (existingProfiles.length > 0) {
              const updateFields: Record<string, unknown> = {};
              if (change.data.name !== undefined) updateFields.name = change.data.name;
              if (change.data.address !== undefined) updateFields.address = change.data.address;
              if (change.data.port !== undefined) updateFields.port = change.data.port;
              if (change.data.protocol !== undefined) updateFields.protocol = change.data.protocol;
              if (change.data.uuid !== undefined) updateFields.uuid = change.data.uuid;
              if (change.data.security !== undefined) updateFields.security = change.data.security;
              if (change.data.sni !== undefined) updateFields.sni = change.data.sni;
              if (Object.keys(updateFields).length > 0) {
                await db.update(vpnProfilesTable).set(updateFields).where(eq(vpnProfilesTable.id, profileId));
              }
            } else if (change.action === "create") {
              await db.insert(vpnProfilesTable).values({
                name: (change.data.name as string) || "Synced Profile",
                protocol: (change.data.protocol as string) || "vless",
                address: (change.data.address as string) || "",
                port: (change.data.port as number) || 443,
                uuid: (change.data.uuid as string) || "",
                security: (change.data.security as string) || "reality",
                sni: (change.data.sni as string) || "",
              });
            }
          }
        } else if (change.action === "delete") {
          const profileId = parseInt(change.entityId, 10);
          if (!isNaN(profileId)) {
            await db.delete(vpnProfilesTable).where(eq(vpnProfilesTable.id, profileId));
          }
        }
      }

      await db.insert(syncChangelogTable).values({
        entityType: change.entityType,
        entityId: change.entityId,
        action: change.action,
        data: change.data ?? null,
        sourceNodeId: change.sourceNodeId,
        timestamp: new Date(change.timestamp),
      });

      accepted++;
    } catch (err) {
      logger.error({ err, change }, "Failed to apply remote change");
      rejected++;
    }
  }

  return { accepted, rejected, conflicts };
}

async function performHeartbeat(node: { id: number; address: string; apiPort: number; clusterSecretHash: string }): Promise<void> {
  const timestamp = new Date().toISOString();
  const signature = generateHmac(`${LOCAL_NODE_ID}:${timestamp}`);
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`http://${node.address}:${node.apiPort}/api/cluster/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: LOCAL_NODE_ID, timestamp, signature }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latency = Date.now() - startTime;

    if (res.ok) {
      await db.update(clusterNodesTable).set({
        status: "online",
        latency,
        lastSeen: new Date(),
        failCount: 0,
      }).where(eq(clusterNodesTable.id, node.id));
    } else {
      await markNodeDegraded(node.id);
    }
  } catch {
    await markNodeDegraded(node.id);
  }
}

async function markNodeDegraded(nodeId: number): Promise<void> {
  const [node] = await db.select().from(clusterNodesTable).where(eq(clusterNodesTable.id, nodeId));
  if (!node) return;

  const newFailCount = node.failCount + 1;
  const newStatus = newFailCount >= 3 ? "offline" : "degraded";

  await db.update(clusterNodesTable).set({
    status: newStatus,
    failCount: newFailCount,
  }).where(eq(clusterNodesTable.id, nodeId));
}

async function performSync(node: { id: number; address: string; apiPort: number; nodeId: string; lastSyncAt: Date | null }): Promise<{ pushed: number; pulled: number; conflicts: number }> {
  const since = node.lastSyncAt || new Date(0);
  const localChanges = await getChangesSince(since);

  const timestamp = new Date().toISOString();
  const signature = generateHmac(`${LOCAL_NODE_ID}:${timestamp}`);
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  try {
    if (localChanges.length > 0) {
      const pushRes = await fetch(`http://${node.address}:${node.apiPort}/api/cluster/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: LOCAL_NODE_ID,
          timestamp,
          signature,
          changes: localChanges,
        }),
      });
      if (pushRes.ok) {
        const pushData = (await pushRes.json()) as { accepted?: number };
        pushed = pushData.accepted || 0;
      }
    }

    const pullRes = await fetch(`http://${node.address}:${node.apiPort}/api/cluster/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: LOCAL_NODE_ID,
        timestamp,
        signature,
        since: since.toISOString(),
      }),
    });

    if (pullRes.ok) {
      const pullData = (await pullRes.json()) as { changes?: Array<{ entityType: string; entityId: string; action: string; data?: Record<string, unknown> | null; timestamp: string; sourceNodeId: string }> };
      if (pullData.changes && pullData.changes.length > 0) {
        const result = await applyRemoteChanges(pullData.changes);
        pulled = result.accepted;
        conflicts = result.conflicts;
      }
    }

    await db.update(clusterNodesTable).set({
      lastSyncAt: new Date(),
      syncStatus: "synced",
    }).where(eq(clusterNodesTable.id, node.id));

    return { pushed, pulled, conflicts };
  } catch (err) {
    logger.error({ err, nodeId: node.nodeId }, "Sync failed");
    await db.update(clusterNodesTable).set({
      syncStatus: "error",
    }).where(eq(clusterNodesTable.id, node.id));
    return { pushed: 0, pulled: 0, conflicts: 0 };
  }
}

async function heartbeatLoop(): Promise<void> {
  try {
    const nodes = await db.select().from(clusterNodesTable);
    for (const node of nodes) {
      await performHeartbeat(node);
    }
  } catch (err) {
    logger.error({ err }, "Heartbeat loop error");
  }
}

async function syncLoop(): Promise<void> {
  if (!autoSync) return;
  try {
    const nodes = await db.select().from(clusterNodesTable);
    const onlineNodes = nodes.filter((n) => n.status === "online");
    for (const node of onlineNodes) {
      await performSync(node);
    }
  } catch (err) {
    logger.error({ err }, "Sync loop error");
  }
}

export function startSyncEngine(): void {
  if (!clusterEnabled) return;
  logger.info({ nodeId: LOCAL_NODE_ID }, "Starting cluster sync engine");

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (syncInterval) clearInterval(syncInterval);

  heartbeatInterval = setInterval(heartbeatLoop, heartbeatIntervalMs);
  syncInterval = setInterval(syncLoop, syncIntervalMs);

  setTimeout(heartbeatLoop, 5000);
}

export function stopSyncEngine(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  logger.info("Cluster sync engine stopped");
}

export function updateSyncConfig(config: {
  localNodeName?: string;
  syncIntervalSeconds?: number;
  heartbeatIntervalSeconds?: number;
  autoSync?: boolean;
  clusterEnabled?: boolean;
}): void {
  if (config.localNodeName !== undefined) {
    localNodeName = config.localNodeName;
  }
  if (config.syncIntervalSeconds !== undefined) {
    syncIntervalMs = config.syncIntervalSeconds * 1000;
  }
  if (config.heartbeatIntervalSeconds !== undefined) {
    heartbeatIntervalMs = config.heartbeatIntervalSeconds * 1000;
  }
  if (config.autoSync !== undefined) {
    autoSync = config.autoSync;
  }
  if (config.clusterEnabled !== undefined) {
    const wasEnabled = clusterEnabled;
    clusterEnabled = config.clusterEnabled;
    if (clusterEnabled && !wasEnabled) {
      startSyncEngine();
    } else if (!clusterEnabled && wasEnabled) {
      stopSyncEngine();
    }
  }
}

export function getClusterConfigState() {
  return {
    localNodeId: LOCAL_NODE_ID,
    localNodeName,
    clusterEnabled,
    syncIntervalSeconds: syncIntervalMs / 1000,
    heartbeatIntervalSeconds: heartbeatIntervalMs / 1000,
    autoSync,
  };
}

export async function triggerSyncForNode(nodeId: number) {
  const [node] = await db.select().from(clusterNodesTable).where(eq(clusterNodesTable.id, nodeId));
  if (!node) throw new Error("Node not found");
  if (node.status === "offline") throw new Error("Node is offline");
  return performSync(node);
}

export async function pingNode(nodeId: number) {
  const [node] = await db.select().from(clusterNodesTable).where(eq(clusterNodesTable.id, nodeId));
  if (!node) throw new Error("Node not found");
  await performHeartbeat(node);
  const [updated] = await db.select().from(clusterNodesTable).where(eq(clusterNodesTable.id, nodeId));
  return updated;
}

if (CLUSTER_SECRET) {
  clusterEnabled = true;
  setTimeout(() => startSyncEngine(), 3000);
}
