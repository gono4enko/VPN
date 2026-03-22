import { Router, type IRouter } from "express";
import { db, vpnUsersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import {
  GetServerStatusResponse,
  RestartServerResponse,
  GetServerConfigResponse,
  GetTrafficStatsResponse,
} from "@workspace/api-zod";
import { getRealityPublicKey, getRealityShortId } from "../lib/reality-keys";
import {
  getXrayStatus,
  restartXray,
  getTrafficHistory,
  getCurrentTraffic,
} from "../services/xray-manager";

const router: IRouter = Router();

const OFFICE_IP = process.env.OFFICE_IP || "happ.su";
const OFFICE_PORT = process.env.OFFICE_PORT || "443";
const OFFICE_SNI = process.env.OFFICE_SNI || "happ.su";

router.get("/server/client-ip", async (req, res): Promise<void> => {
  const ip = req.ip || 'unknown';
  res.json({ ip });
});

router.get("/server/status", async (_req, res): Promise<void> => {
  const users = await db.select({ count: count() }).from(vpnUsersTable).where(eq(vpnUsersTable.status, "active"));

  const xray = getXrayStatus();

  res.json(GetServerStatusResponse.parse({
    running: xray.running,
    uptime: xray.uptime || "0h 0m",
    version: xray.version || "Xray not installed",
    activeOutbound: "VLESS+Reality Server",
    connectedClients: users[0]?.count ?? 0,
    currentPing: null,
  }));
});

router.post("/server/restart", async (_req, res): Promise<void> => {
  const result = await restartXray();
  res.json(RestartServerResponse.parse({ message: result.message }));
});

router.get("/server/config", async (_req, res): Promise<void> => {
  res.json(GetServerConfigResponse.parse({
    officeIp: OFFICE_IP,
    officePort: OFFICE_PORT,
    officeSni: OFFICE_SNI,
    autoSwitch: false,
    autoSwitchInterval: 30,
    autoSwitchThreshold: 50,
    realityPublicKey: getRealityPublicKey(),
    realityShortId: getRealityShortId(),
  }));
});

router.get("/traffic/stats", async (_req, res): Promise<void> => {
  const points = await getTrafficHistory(24);
  const current = getCurrentTraffic();

  const totalIn = current.inbound > 0
    ? Math.round(current.inbound / 1024 / 1024)
    : points.reduce((sum, p) => sum + p.inbound, 0);
  const totalOut = current.outbound > 0
    ? Math.round(current.outbound / 1024 / 1024)
    : points.reduce((sum, p) => sum + p.outbound, 0);

  res.json(GetTrafficStatsResponse.parse({
    points,
    totalIn,
    totalOut,
  }));
});

export default router;
