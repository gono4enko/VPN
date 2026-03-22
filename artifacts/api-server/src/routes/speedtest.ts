import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnProfilesTable } from "@workspace/db";
import {
  RunSpeedtestResponse,
  AutoSelectProfileResponse,
} from "@workspace/api-zod";
import { tcpPing } from "../services/tcp-ping";

const router: IRouter = Router();

router.post("/speedtest/run", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  const results: { profileId: number; profileName: string; ping: number; status: "ok" | "fail" }[] = [];

  await Promise.all(profiles.map(async (p) => {
    const result = await tcpPing(p.address, p.port);
    await db.update(vpnProfilesTable).set({
      lastPing: result.latencyMs,
      lastDownloadSpeed: result.tlsEstimateMs ? Math.round((1000 / result.tlsEstimateMs) * 100) / 100 : null,
      lastCheckAt: new Date(),
      isOnline: result.reachable,
    }).where(eq(vpnProfilesTable.id, p.id));

    results.push({
      profileId: p.id,
      profileName: `${p.countryFlag} ${p.name}`,
      ping: result.latencyMs,
      status: result.reachable ? "ok" : "fail",
    });
  }));

  res.json(RunSpeedtestResponse.parse(results));
});

router.post("/speedtest/auto-select", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  if (profiles.length === 0) {
    res.status(400).json({ error: "No profiles available" });
    return;
  }

  const pingResults: { profile: typeof profiles[0]; latency: number; reachable: boolean }[] = [];

  await Promise.all(profiles.map(async (p) => {
    const result = await tcpPing(p.address, p.port);
    await db.update(vpnProfilesTable).set({
      lastPing: result.latencyMs,
      lastDownloadSpeed: result.tlsEstimateMs ? Math.round((1000 / result.tlsEstimateMs) * 100) / 100 : null,
      lastCheckAt: new Date(),
      isOnline: result.reachable,
    }).where(eq(vpnProfilesTable.id, p.id));
    pingResults.push({ profile: p, latency: result.latencyMs, reachable: result.reachable });
  }));

  const reachable = pingResults.filter(r => r.reachable).sort((a, b) => a.latency - b.latency);
  if (reachable.length === 0) {
    res.status(400).json({ error: "Все узлы недоступны" });
    return;
  }

  const best = reachable[0];
  await db.update(vpnProfilesTable).set({ isActive: false }).where(eq(vpnProfilesTable.isActive, true));
  await db.update(vpnProfilesTable).set({ isActive: true, status: "active" }).where(eq(vpnProfilesTable.id, best.profile.id));

  res.json(AutoSelectProfileResponse.parse({
    selectedProfileId: best.profile.id,
    selectedProfileName: `${best.profile.countryFlag} ${best.profile.name}`,
    ping: best.latency,
    message: `Переключено на ${best.profile.countryFlag} ${best.profile.name} (${best.latency}мс)`,
  }));
});

export default router;
