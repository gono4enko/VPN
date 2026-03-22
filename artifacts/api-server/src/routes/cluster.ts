import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnServersTable } from "@workspace/db";
import type { VpnServer } from "@workspace/db/schema";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

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
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

router.get("/cluster/servers", async (_req, res): Promise<void> => {
  const servers = await db.select().from(vpnServersTable).orderBy(vpnServersTable.createdAt);
  res.json(ListServersResponse.parse(servers.map(formatServer)));
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

  const [server] = await db.update(vpnServersTable)
    .set(updateData)
    .where(eq(vpnServersTable.id, params.data.id))
    .returning();

  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(UpdateServerResponse.parse(formatServer(server)));
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

  res.json(PingServerResponse.parse(formatServer(server)));
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

  res.json(SetPrimaryServerResponse.parse(formatServer(server!)));
});

router.get("/cluster/stats", async (_req, res): Promise<void> => {
  const servers = await db.select().from(vpnServersTable);
  const online = servers.filter(s => s.status === "online");
  const pings = online.map(s => s.lastPing).filter((p): p is number => p !== null);

  res.json(GetClusterStatsResponse.parse({
    totalServers: servers.length,
    onlineServers: online.length,
    totalClients: servers.reduce((sum, s) => sum + s.connectedClients, 0),
    avgPing: pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null,
    totalBandwidth: servers.reduce((sum, s) => sum + s.bandwidthUsed, 0),
  }));
});

export default router;
