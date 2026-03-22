import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnProfilesTable } from "@workspace/db";
import {
  RunSpeedtestResponse,
  AutoSelectProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/speedtest/run", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  const results = profiles.map((p) => {
    const ping = Math.floor(Math.random() * 200) + 10;
    return {
      profileId: p.id,
      profileName: `${p.countryFlag} ${p.name}`,
      ping,
      status: "ok" as const,
    };
  });

  for (const r of results) {
    await db.update(vpnProfilesTable).set({ lastPing: r.ping }).where(eq(vpnProfilesTable.id, r.profileId));
  }

  res.json(RunSpeedtestResponse.parse(results));
});

router.post("/speedtest/auto-select", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable);

  if (profiles.length === 0) {
    res.status(400).json({ error: "No profiles available" });
    return;
  }

  const results = profiles.map((p) => ({
    ...p,
    testPing: Math.floor(Math.random() * 200) + 10,
  }));

  results.sort((a, b) => a.testPing - b.testPing);
  const best = results[0];

  await db.update(vpnProfilesTable).set({ isActive: false }).where(eq(vpnProfilesTable.isActive, true));
  await db.update(vpnProfilesTable).set({ isActive: true, status: "active", lastPing: best.testPing }).where(eq(vpnProfilesTable.id, best.id));

  for (const r of results) {
    await db.update(vpnProfilesTable).set({ lastPing: r.testPing }).where(eq(vpnProfilesTable.id, r.id));
  }

  res.json(AutoSelectProfileResponse.parse({
    selectedProfileId: best.id,
    selectedProfileName: `${best.countryFlag} ${best.name}`,
    ping: best.testPing,
    message: `Switched to ${best.countryFlag} ${best.name} (${best.testPing}ms)`,
  }));
});

export default router;
