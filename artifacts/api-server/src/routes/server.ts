import { Router, type IRouter } from "express";
import { db, vpnUsersTable, vpnProfilesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { execSync } from "child_process";
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

let cachedExternalIp: string | null = null;
let externalIpLastFetch = 0;

async function fetchExternalIp(): Promise<string> {
  const now = Date.now();
  if (cachedExternalIp && now - externalIpLastFetch < 300000) {
    return cachedExternalIp;
  }
  try {
    const resp = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
    const data = (await resp.json()) as { ip: string };
    cachedExternalIp = data.ip;
    externalIpLastFetch = now;
    return data.ip;
  } catch {
    return cachedExternalIp || "Не определён";
  }
}

router.get("/server/client-ip", async (req, res): Promise<void> => {
  let ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    || req.headers["x-real-ip"]?.toString()
    || req.socket.remoteAddress
    || req.ip
    || "unknown";

  if (ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "127.0.0.1") {
    ip = await fetchExternalIp();
  } else if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  res.json({ ip });
});

function measurePing(address: string): number | null {
  try {
    const cmd = process.platform === "darwin"
      ? `ping -c 1 -W 2 ${address}`
      : `ping -c 1 -W 2 ${address}`;
    const output = execSync(cmd, { timeout: 5000, encoding: "utf-8" });
    const match = output.match(/time[=<]([\d.]+)\s*ms/);
    return match ? Math.round(parseFloat(match[1])) : null;
  } catch {
    return null;
  }
}

router.get("/server/status", async (_req, res): Promise<void> => {
  const users = await db.select({ count: count() }).from(vpnUsersTable).where(eq(vpnUsersTable.status, "active"));
  const activeProfiles = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.isActive, true));
  const activeProfile = activeProfiles.length > 0 ? activeProfiles[0] : null;

  const xray = getXrayStatus();

  let activeOutbound = "Прямое подключение";
  let currentPing: number | null = null;

  if (activeProfile) {
    activeOutbound = activeProfile.name;
    currentPing = measurePing(activeProfile.address);
  }

  res.json(GetServerStatusResponse.parse({
    running: xray.running,
    uptime: xray.uptime || "0h 0m",
    version: xray.version || "Xray not installed",
    activeOutbound,
    connectedClients: users[0]?.count ?? 0,
    currentPing,
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
