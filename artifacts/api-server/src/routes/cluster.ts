import { Router, type IRouter } from "express";
import { eq, gt } from "drizzle-orm";
import { db, vpnServersTable, clusterNodesTable, syncChangelogTable, vpnUsersTable, vpnProfilesTable } from "@workspace/db";
import type { VpnServer, ClusterNode } from "@workspace/db/schema";
import QRCode from "qrcode";
import {
  ListServersResponse,
  CreateServerBody,
  UpdateServerParams,
  UpdateServerBody,
  UpdateServerResponse,
  DeleteServerParams,
  PingServerParams,
  PingServerResponse,
  SetPrimaryServerParams,
  SetPrimaryServerResponse,
  GetClusterStatsResponse,
  ListClusterNodesResponse,
  AddClusterNodeBody,
  RemoveClusterNodeParams,
  PingClusterNodeParams,
  PingClusterNodeResponse,
  SyncClusterNodeParams,
  SyncClusterNodeResponse,
  GetClusterSyncStatusResponse,
  ClusterHeartbeatBody,
  ClusterHeartbeatResponse,
  ClusterSyncPushBody,
  ClusterSyncPushResponse,
  ClusterSyncPullBody,
  ClusterSyncPullResponse,
  GetClusterConfigResponse,
  UpdateClusterConfigBody,
  UpdateClusterConfigResponse,
  GetUserMultiVlessParams,
  GetUserMultiVlessResponse,
} from "@workspace/api-zod";
import {
  getLocalNodeId,
  hashSecret,
  generateHmac,
  verifyHmac,
  verifyIncomingRequest,
  getChangesSince,
  applyRemoteChanges,
  getClusterConfigState,
  updateSyncConfig,
  triggerSyncForNode,
  pingNode,
} from "../services/sync-engine";

const router: IRouter = Router();

const OFFICE_IP = process.env.OFFICE_IP || "happ.su";
const OFFICE_PORT = process.env.OFFICE_PORT || "443";
const OFFICE_PUBLIC_KEY = process.env.OFFICE_PUBLIC_KEY || "";
const OFFICE_SHORT_ID = process.env.OFFICE_SHORT_ID || "";
const OFFICE_SNI = process.env.OFFICE_SNI || "happ.su";

function formatServer(server: VpnServer) {
  return {
    id: server.id,
    name: server.name,
    address: server.address,
    port: server.port,
    country: server.country,
    countryFlag: server.countryFlag,
    provider: server.provider,
    status: server.status,
    lastPing: server.lastPing,
    cpuUsage: server.cpuUsage,
    memUsage: server.memUsage,
    bandwidthUsed: server.bandwidthUsed,
    bandwidthLimit: server.bandwidthLimit,
    connectedClients: server.connectedClients,
    maxClients: server.maxClients,
    isPrimary: server.isPrimary,
    syncUrl: server.syncUrl || null,
    syncStatus: server.syncStatus,
    lastSyncAt: server.lastSyncAt ? server.lastSyncAt.toISOString() : null,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

function formatNode(node: ClusterNode) {
  return {
    id: node.id,
    nodeId: node.nodeId,
    name: node.name,
    address: node.address,
    port: node.port,
    apiPort: node.apiPort,
    status: node.status,
    latency: node.latency,
    lastSeen: node.lastSeen?.toISOString() ?? null,
    lastSyncAt: node.lastSyncAt?.toISOString() ?? null,
    syncStatus: node.syncStatus,
    failCount: node.failCount,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

router.get("/cluster/servers", async (_req, res): Promise<void> => {
  const servers = await db.select().from(vpnServersTable).orderBy(vpnServersTable.createdAt);
  res.json(servers.map(formatServer));
});

router.post("/cluster/servers", async (req, res): Promise<void> => {
  const parsed = CreateServerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [server] = await db.insert(vpnServersTable).values({
    name: parsed.data.name,
    address: parsed.data.address,
    port: parsed.data.port ?? 443,
    country: parsed.data.country ?? "Unknown",
    countryFlag: parsed.data.countryFlag ?? "🌐",
    provider: parsed.data.provider ?? "",
    maxClients: parsed.data.maxClients ?? 100,
    syncUrl: (req.body as Record<string, unknown>).syncUrl as string || null,
    syncSecret: (req.body as Record<string, unknown>).syncSecret as string || null,
    status: "offline",
  }).returning();

  res.status(201).json(formatServer(server));
});

router.put("/cluster/servers/:id", async (req, res): Promise<void> => {
  const params = UpdateServerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateServerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const validStatuses = ["online", "offline", "maintenance"];
  if (body.data.status !== undefined && !validStatuses.includes(body.data.status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.name !== undefined) updateData.name = body.data.name;
  if (body.data.address !== undefined) updateData.address = body.data.address;
  if (body.data.port !== undefined) updateData.port = body.data.port;
  if (body.data.country !== undefined) updateData.country = body.data.country;
  if (body.data.countryFlag !== undefined) updateData.countryFlag = body.data.countryFlag;
  if (body.data.provider !== undefined) updateData.provider = body.data.provider;
  if (body.data.maxClients !== undefined) updateData.maxClients = body.data.maxClients;
  if (body.data.status !== undefined) updateData.status = body.data.status;

  const rawBody = req.body as Record<string, unknown>;
  if (rawBody.syncUrl !== undefined) updateData.syncUrl = rawBody.syncUrl || null;
  if (rawBody.syncSecret !== undefined) updateData.syncSecret = rawBody.syncSecret || null;

  const [server] = await db.update(vpnServersTable)
    .set(updateData)
    .where(eq(vpnServersTable.id, params.data.id))
    .returning();

  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(formatServer(server));
});

router.delete("/cluster/servers/:id", async (req, res): Promise<void> => {
  const params = DeleteServerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(vpnServersTable).where(eq(vpnServersTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/cluster/servers/:id/ping", async (req, res): Promise<void> => {
  const params = PingServerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ping = Math.floor(Math.random() * 200) + 5;
  const cpu = Math.round(Math.random() * 80 + 5);
  const mem = Math.round(Math.random() * 70 + 10);

  const [server] = await db.update(vpnServersTable)
    .set({ lastPing: ping, cpuUsage: cpu, memUsage: mem, status: "online" })
    .where(eq(vpnServersTable.id, params.data.id))
    .returning();

  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(formatServer(server));
});

router.post("/cluster/servers/:id/set-primary", async (req, res): Promise<void> => {
  const params = SetPrimaryServerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existing = await db.select({ id: vpnServersTable.id })
    .from(vpnServersTable)
    .where(eq(vpnServersTable.id, params.data.id));

  if (existing.length === 0) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  await db.update(vpnServersTable).set({ isPrimary: false }).where(eq(vpnServersTable.isPrimary, true));

  const [server] = await db.update(vpnServersTable)
    .set({ isPrimary: true })
    .where(eq(vpnServersTable.id, params.data.id))
    .returning();

  res.json(formatServer(server!));
});

router.get("/cluster/stats", async (_req, res): Promise<void> => {
  const servers = await db.select().from(vpnServersTable);
  const nodes = await db.select().from(clusterNodesTable);
  const online = servers.filter(s => s.status === "online");
  const onlineNodes = nodes.filter(n => n.status === "online");
  const pings = online.map(s => s.lastPing).filter((p): p is number => p !== null);

  const lastSyncTimes = nodes
    .map(n => n.lastSyncAt)
    .filter((t): t is Date => t !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  res.json(GetClusterStatsResponse.parse({
    totalServers: servers.length,
    onlineServers: online.length,
    totalClients: servers.reduce((sum, s) => sum + s.connectedClients, 0),
    avgPing: pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
    totalBandwidth: servers.reduce((sum, s) => sum + s.bandwidthUsed, 0),
    totalNodes: nodes.length,
    onlineNodes: onlineNodes.length,
    lastSyncAt: lastSyncTimes.length > 0 ? lastSyncTimes[0].toISOString() : null,
  }));
});

router.get("/cluster/nodes", async (_req, res): Promise<void> => {
  const nodes = await db.select().from(clusterNodesTable).orderBy(clusterNodesTable.createdAt);
  res.json(ListClusterNodesResponse.parse(nodes.map(formatNode)));
});

router.post("/cluster/nodes", async (req, res): Promise<void> => {
  const parsed = AddClusterNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const nodeId = `peer-${Date.now().toString(36)}`;
  const secretHash = hashSecret(parsed.data.clusterSecret);

  const [node] = await db.insert(clusterNodesTable).values({
    nodeId,
    name: parsed.data.name,
    address: parsed.data.address,
    port: parsed.data.port ?? 443,
    apiPort: parsed.data.apiPort ?? 3000,
    clusterSecretHash: secretHash,
    status: "offline",
    syncStatus: "pending",
  }).returning();

  res.status(201).json(formatNode(node));
});

router.delete("/cluster/nodes/:id", async (req, res): Promise<void> => {
  const params = RemoveClusterNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(clusterNodesTable).where(eq(clusterNodesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/cluster/nodes/:id/ping", async (req, res): Promise<void> => {
  const params = PingClusterNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const updated = await pingNode(params.data.id);
    if (!updated) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json(PingClusterNodeResponse.parse(formatNode(updated)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ping failed";
    res.status(400).json({ error: message });
  }
});

router.post("/cluster/nodes/:id/sync", async (req, res): Promise<void> => {
  const params = SyncClusterNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const result = await triggerSyncForNode(params.data.id);
    const [node] = await db.select().from(clusterNodesTable).where(eq(clusterNodesTable.id, params.data.id));

    res.json(SyncClusterNodeResponse.parse({
      nodeId: node?.nodeId || "",
      pushed: result.pushed,
      pulled: result.pulled,
      conflicts: result.conflicts,
      message: `Sync completed: ${result.pushed} pushed, ${result.pulled} pulled, ${result.conflicts} conflicts`,
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    res.status(400).json({ error: message });
  }
});

router.get("/cluster/sync/status", async (_req, res): Promise<void> => {
  const nodes = await db.select().from(clusterNodesTable);
  const localNodeId = getLocalNodeId();

  const nodeStatuses = await Promise.all(nodes.map(async (node) => {
    const pendingChanges = await db.select().from(syncChangelogTable)
      .where(gt(syncChangelogTable.timestamp, node.lastSyncAt || new Date(0)));

    return {
      nodeId: node.nodeId,
      name: node.name,
      status: node.status,
      lastSyncAt: node.lastSyncAt?.toISOString() ?? null,
      syncStatus: node.syncStatus,
      pendingChanges: pendingChanges.length,
    };
  }));

  const totalPendingChanges = nodeStatuses.reduce((sum, n) => sum + n.pendingChanges, 0);

  res.json(GetClusterSyncStatusResponse.parse({
    localNodeId,
    nodes: nodeStatuses,
    totalPendingChanges,
  }));
});

router.post("/cluster/heartbeat", async (req, res): Promise<void> => {
  const parsed = ClusterHeartbeatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = verifyIncomingRequest(
    parsed.data.nodeId,
    parsed.data.timestamp,
    parsed.data.signature,
  );
  if (!auth.valid) {
    res.status(403).json({ error: auth.error || "Authentication failed" });
    return;
  }

  const nodes = await db.select().from(clusterNodesTable);
  const senderNode = nodes.find(n => n.nodeId === parsed.data.nodeId);

  if (senderNode) {
    await db.update(clusterNodesTable).set({
      status: "online",
      lastSeen: new Date(),
      failCount: 0,
    }).where(eq(clusterNodesTable.id, senderNode.id));
  }

  res.json(ClusterHeartbeatResponse.parse({
    acknowledged: true,
    serverTime: new Date().toISOString(),
    nodeId: getLocalNodeId(),
  }));
});

router.post("/cluster/sync/push", async (req, res): Promise<void> => {
  const parsed = ClusterSyncPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = verifyIncomingRequest(
    parsed.data.nodeId,
    parsed.data.timestamp,
    parsed.data.signature,
  );
  if (!auth.valid) {
    res.status(403).json({ error: auth.error || "Authentication failed" });
    return;
  }

  const changes = (parsed.data.changes || []).map((c: Record<string, unknown>) => ({
    entityType: c.entityType as string,
    entityId: c.entityId as string,
    action: c.action as string,
    data: (c.data as Record<string, unknown>) ?? null,
    timestamp: c.timestamp as string,
    sourceNodeId: parsed.data.nodeId,
  }));

  const result = await applyRemoteChanges(changes);

  res.json(ClusterSyncPushResponse.parse({
    accepted: result.accepted,
    rejected: result.rejected,
    conflicts: result.conflicts,
  }));
});

router.post("/cluster/sync/pull", async (req, res): Promise<void> => {
  const parsed = ClusterSyncPullBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const auth = verifyIncomingRequest(
    parsed.data.nodeId,
    parsed.data.timestamp,
    parsed.data.signature,
  );
  if (!auth.valid) {
    res.status(403).json({ error: auth.error || "Authentication failed" });
    return;
  }

  const since = new Date(parsed.data.since);
  const changes = await getChangesSince(since);

  res.json(ClusterSyncPullResponse.parse({
    changes,
    serverTime: new Date().toISOString(),
  }));
});

router.post("/cluster/sync/trigger", async (_req, res): Promise<void> => {
  const nodes = await db.select().from(clusterNodesTable);
  let synced = 0;
  let errors = 0;

  for (const node of nodes) {
    try {
      await triggerSyncForNode(node.id);
      synced++;
    } catch {
      errors++;
    }
  }

  res.json({ status: "ok", synced, errors });
});

router.get("/cluster/config", async (_req, res): Promise<void> => {
  const config = getClusterConfigState();
  res.json(GetClusterConfigResponse.parse(config));
});

router.put("/cluster/config", async (req, res): Promise<void> => {
  const parsed = UpdateClusterConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  updateSyncConfig({
    localNodeName: parsed.data.localNodeName,
    syncIntervalSeconds: parsed.data.syncIntervalSeconds,
    heartbeatIntervalSeconds: parsed.data.heartbeatIntervalSeconds,
    autoSync: parsed.data.autoSync,
    clusterEnabled: parsed.data.clusterEnabled,
  });

  const config = getClusterConfigState();
  res.json(UpdateClusterConfigResponse.parse(config));
});

router.get("/users/:id/multi-vless", async (req, res): Promise<void> => {
  const params = GetUserMultiVlessParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(vpnUsersTable).where(eq(vpnUsersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const servers = await db.select().from(vpnServersTable).orderBy(vpnServersTable.isPrimary);
  const nodes = await db.select().from(clusterNodesTable);

  const urls: Array<{
    nodeId: string;
    nodeName: string;
    vlessUrl: string;
    address: string;
    port: number;
    latency: number | null;
    status: string;
  }> = [];

  const primaryUrl = `vless://${user.uuid}@${OFFICE_IP}:${OFFICE_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${OFFICE_SNI}&fp=random&pbk=${OFFICE_PUBLIC_KEY}&sid=${OFFICE_SHORT_ID}&type=tcp#${encodeURIComponent(user.name + " (Primary)")}`;
  urls.push({
    nodeId: getLocalNodeId(),
    nodeName: "Primary",
    vlessUrl: primaryUrl,
    address: OFFICE_IP,
    port: parseInt(OFFICE_PORT, 10),
    latency: null,
    status: "online",
  });

  for (const server of servers.filter(s => s.status === "online")) {
    const serverUrl = `vless://${user.uuid}@${server.address}:${server.port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${server.address}&fp=random&type=tcp#${encodeURIComponent(user.name + " (" + server.name + ")")}`;
    urls.push({
      nodeId: `server-${server.id}`,
      nodeName: server.name,
      vlessUrl: serverUrl,
      address: server.address,
      port: server.port,
      latency: server.lastPing,
      status: server.status,
    });
  }

  for (const node of nodes.filter(n => n.status === "online")) {
    const nodeUrl = `vless://${user.uuid}@${node.address}:${node.port}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${node.address}&fp=random&type=tcp#${encodeURIComponent(user.name + " (" + node.name + ")")}`;
    urls.push({
      nodeId: node.nodeId,
      nodeName: node.name,
      vlessUrl: nodeUrl,
      address: node.address,
      port: node.port,
      latency: node.latency,
      status: node.status,
    });
  }

  const allUrls = urls.map(u => u.vlessUrl).join("\n");
  const qrDataUrl = await QRCode.toDataURL(allUrls.length > 4000 ? primaryUrl : allUrls, { width: 300, margin: 2 });

  res.json(GetUserMultiVlessResponse.parse({
    urls,
    qrDataUrl,
    primaryUrl,
  }));
});


router.get("/cluster/failover-urls/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const users = await db.select().from(vpnUsersTable).where(eq(vpnUsersTable.id, userId));
  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  const profiles = await db.select().from(vpnProfilesTable).orderBy(vpnProfilesTable.createdAt);
  const onlineProfiles = profiles.filter(p => p.isOnline !== false);
  const targetProfiles = onlineProfiles.length > 0 ? onlineProfiles : profiles;

  if (targetProfiles.length === 0) {
    res.json({ userId: user.id, userName: user.name, urls: [], combined: "" });
    return;
  }

  const sorted = [...targetProfiles].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    const pa = a.lastPing ?? 9999;
    const pb = b.lastPing ?? 9999;
    return pa - pb;
  });

  const urls = sorted.map(p => {
    const params = new URLSearchParams();
    if (p.security) params.set("security", p.security);
    if (p.flow) params.set("flow", p.flow);
    if (p.sni) params.set("sni", p.sni);
    if (p.publicKey) params.set("pbk", p.publicKey);
    const sid = (p.shortId || "").split("#")[0];
    if (sid) params.set("sid", sid);
    if (p.fingerprint) params.set("fp", p.fingerprint);
    const transportType = p.transportType || "tcp";
    params.set("type", transportType);
    if (transportType === "ws" && p.transportPath) params.set("path", p.transportPath);
    if (transportType === "ws" && p.transportHost) params.set("host", p.transportHost);
    if (transportType === "grpc" && p.transportPath) params.set("serviceName", p.transportPath);

    const fragment = encodeURIComponent(p.name || p.address);
    return `vless://${user.uuid}@${p.address}:${p.port}?${params.toString()}#${fragment}`;
  });

  const combined = Buffer.from(urls.join("\n")).toString("base64");

  res.json({
    userId: user.id,
    userName: user.name,
    urls,
    combined,
  });
});

router.get("/cluster/failover-urls", async (_req, res): Promise<void> => {
  const users = await db.select().from(vpnUsersTable);
  const profiles = await db.select().from(vpnProfilesTable).orderBy(vpnProfilesTable.createdAt);

  if (profiles.length === 0 || users.length === 0) {
    res.json({ users: [] });
    return;
  }

  const onlineProfiles = profiles.filter(p => p.isOnline !== false);
  const targetProfiles = onlineProfiles.length > 0 ? onlineProfiles : profiles;

  const sorted = [...targetProfiles].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return (a.lastPing ?? 9999) - (b.lastPing ?? 9999);
  });

  const result = users.map(user => {
    const urls = sorted.map(p => {
      const params = new URLSearchParams();
      if (p.security) params.set("security", p.security);
      if (p.flow) params.set("flow", p.flow);
      if (p.sni) params.set("sni", p.sni);
      if (p.publicKey) params.set("pbk", p.publicKey);
      const sid = (p.shortId || "").split("#")[0];
      if (sid) params.set("sid", sid);
      if (p.fingerprint) params.set("fp", p.fingerprint);
      const transportType = p.transportType || "tcp";
      params.set("type", transportType);
      if (transportType === "ws" && p.transportPath) params.set("path", p.transportPath);
      if (transportType === "ws" && p.transportHost) params.set("host", p.transportHost);
      if (transportType === "grpc" && p.transportPath) params.set("serviceName", p.transportPath);

      const fragment = encodeURIComponent(p.name || p.address);
      return `vless://${user.uuid}@${p.address}:${p.port}?${params.toString()}#${fragment}`;
    });

    return {
      userId: user.id,
      userName: user.name,
      urlCount: urls.length,
      combined: Buffer.from(urls.join("\n")).toString("base64"),
    };
  });

  res.json({ users: result });
});

export default router;
