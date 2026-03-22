import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnProfilesTable } from "@workspace/db";
import {
  RunSpeedtestResponse,
  AutoSelectProfileResponse,
} from "@workspace/api-zod";
import { measureNode } from "../services/tcp-ping";

const router: IRouter = Router();

router.post("/speedtest/run", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  const results = [];
  for (const p of profiles) {
    const measurement = await measureNode(p.address, p.port, p.security || undefined, p.sni || undefined);
    const ping = measurement.ping;
    const status = measurement.isOnline ? "ok" : "timeout";

    await db.update(vpnProfilesTable).set({
      lastPing: ping,
      lastDownloadSpeed: measurement.downloadSpeed,
      lastCheckAt: new Date(),
      isOnline: measurement.isOnline,
    }).where(eq(vpnProfilesTable.id, p.id));

    results.push({
      profileId: p.id,
      profileName: `${p.countryFlag} ${p.name}`,
      ping,
      status,
    });
  }

  res.json(RunSpeedtestResponse.parse(results));
});

router.post("/speedtest/auto-select", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  if (profiles.length === 0) {
    res.status(400).json({ error: "No profiles available" });
    return;
  }

  const results = [];
  for (const p of profiles) {
    const measurement = await measureNode(p.address, p.port, p.security || undefined, p.sni || undefined);

    await db.update(vpnProfilesTable).set({
      lastPing: measurement.ping,
      lastDownloadSpeed: measurement.downloadSpeed,
      lastCheckAt: new Date(),
      isOnline: measurement.isOnline,
    }).where(eq(vpnProfilesTable.id, p.id));

    results.push({
      ...p,
      testPing: measurement.ping,
      isOnline: measurement.isOnline,
    });
  }

  const onlineResults = results.filter(r => r.isOnline && r.testPing !== null);
  if (onlineResults.length === 0) {
    res.status(400).json({ error: "No reachable profiles found" });
    return;
  }

  onlineResults.sort((a, b) => (a.testPing || 9999) - (b.testPing || 9999));
  const best = onlineResults[0];

  await db.update(vpnProfilesTable).set({ isActive: false }).where(eq(vpnProfilesTable.isActive, true));
  await db.update(vpnProfilesTable).set({ isActive: true, status: "active" }).where(eq(vpnProfilesTable.id, best.id));

  res.json(AutoSelectProfileResponse.parse({
    selectedProfileId: best.id,
    selectedProfileName: `${best.countryFlag} ${best.name}`,
    ping: best.testPing!,
    message: `Switched to ${best.countryFlag} ${best.name} (${best.testPing}ms)`,
  }));
});

export default router;
