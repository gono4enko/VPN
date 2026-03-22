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

function getLocalIp(): string {
  if (process.env.OFFICE_IP) return process.env.OFFICE_IP;
  try {
    const os = require("os");
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal && net.address.startsWith("192.168.")) {
          return net.address;
        }
      }
    }
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

const OFFICE_IP = getLocalIp();
const OFFICE_PORT = process.env.OFFICE_PORT || process.env.XRAY_LISTEN_PORT || "8443";
const OFFICE_SNI = process.env.OFFICE_SNI || process.env.REALITY_SERVER_NAMES?.split(",")[0]?.trim() || "www.microsoft.com";

router.get("/server/client-ip", async (req, res): Promise<void> => {
  let ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    || req.headers["x-real-ip"]?.toString()
    || req.socket.remoteAddress
    || req.ip
    || "unknown";

  if (ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "127.0.0.1") {
    ip = "localhost";
  } else if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

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
