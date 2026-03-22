import { Router, type IRouter } from "express";
import { db, vpnUsersTable, vpnProfilesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import {
  GetServerStatusResponse,
  RestartServerResponse,
  GetServerConfigResponse,
  GetTrafficStatsResponse,
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

const OFFICE_IP = process.env.OFFICE_IP || "0.0.0.0";
const OFFICE_PORT = process.env.OFFICE_PORT || "443";
const OFFICE_SNI = process.env.OFFICE_SNI || "apple.com";

const startTime = Date.now();

router.get("/server/status", authMiddleware, async (_req, res): Promise<void> => {
  const users = await db.select({ count: count() }).from(vpnUsersTable).where(eq(vpnUsersTable.status, "active"));
  const activeProfile = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.isActive, true));

  const uptimeMs = Date.now() - startTime;
  const hours = Math.floor(uptimeMs / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);

  res.json(GetServerStatusResponse.parse({
    running: true,
    uptime: `${hours}h ${minutes}m`,
    version: "Xray 1.8.4 (simulated)",
    activeOutbound: activeProfile.length > 0 ? `${activeProfile[0].countryFlag} ${activeProfile[0].name}` : null,
    connectedClients: users[0]?.count ?? 0,
    currentPing: activeProfile.length > 0 ? (activeProfile[0].lastPing || Math.floor(Math.random() * 50) + 10) : null,
  }));
});

router.post("/server/restart", authMiddleware, async (_req, res): Promise<void> => {
  res.json(RestartServerResponse.parse({ message: "Xray server restarted successfully (simulated)" }));
});

router.get("/server/config", authMiddleware, async (_req, res): Promise<void> => {
  res.json(GetServerConfigResponse.parse({
    officeIp: OFFICE_IP,
    officePort: OFFICE_PORT,
    officeSni: OFFICE_SNI,
    autoSwitch: false,
    autoSwitchInterval: 30,
    autoSwitchThreshold: 50,
  }));
});

router.get("/traffic/stats", authMiddleware, async (_req, res): Promise<void> => {
  const now = new Date();
  const points = [];
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000);
    points.push({
      time: time.toISOString(),
      inbound: Math.floor(Math.random() * 500) + 50,
      outbound: Math.floor(Math.random() * 300) + 30,
    });
  }

  res.json(GetTrafficStatsResponse.parse({
    points,
    totalIn: points.reduce((sum, p) => sum + p.inbound, 0),
    totalOut: points.reduce((sum, p) => sum + p.outbound, 0),
  }));
});

export default router;
