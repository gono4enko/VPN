import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnProfilesTable } from "@workspace/db";
import {
  GetAntiDpiSettingsResponse,
  UpdateAntiDpiSettingsBody,
  UpdateAntiDpiSettingsResponse,
  TriggerTransportFallbackParams,
  TriggerTransportFallbackResponse,
  RotateFingerprintParams,
  RotateFingerprintResponse,
  GetXrayConfigParams,
  GetXrayConfigResponse,
} from "@workspace/api-zod";
import { authMiddleware } from "../middlewares/auth";
import { buildXrayConfig } from "../lib/xray-config";
import {
  rotateFingerprint,
  switchTransport,
  setAutoFallback,
  getAutoFallback,
  isValidTransport,
  isValidFingerprint,
} from "../lib/anti-dpi-monitor";

const router: IRouter = Router();

const DEFAULT_SETTINGS = {
  fragmentEnabled: true,
  fragmentLength: "100-200",
  fragmentInterval: "10-20",
  fingerprintRotation: true,
  fingerprintInterval: 360,
  fingerprintList: ["chrome", "firefox", "safari", "edge", "random"],
  transportPriority: ["tcp", "ws", "grpc", "h2"],
  autoFallback: true,
};

let globalSettings = { ...DEFAULT_SETTINGS };

router.get("/anti-dpi/settings", authMiddleware, async (_req, res): Promise<void> => {
  globalSettings.autoFallback = getAutoFallback();
  res.json(GetAntiDpiSettingsResponse.parse(globalSettings));
});

router.put("/anti-dpi/settings", authMiddleware, async (req, res): Promise<void> => {
  const parsed = UpdateAntiDpiSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  if (data.transportPriority) {
    const invalid = data.transportPriority.filter(t => !isValidTransport(t));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid transport types: ${invalid.join(", ")}. Allowed: tcp, ws, grpc, h2` });
      return;
    }
  }

  if (data.fingerprintList) {
    const invalid = data.fingerprintList.filter(fp => !isValidFingerprint(fp));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid fingerprints: ${invalid.join(", ")}. Allowed: chrome, firefox, safari, edge, ios, android, random, randomized` });
      return;
    }
  }

  if (data.fragmentEnabled !== undefined) globalSettings.fragmentEnabled = data.fragmentEnabled;
  if (data.fragmentLength !== undefined) globalSettings.fragmentLength = data.fragmentLength;
  if (data.fragmentInterval !== undefined) globalSettings.fragmentInterval = data.fragmentInterval;
  if (data.fingerprintRotation !== undefined) globalSettings.fingerprintRotation = data.fingerprintRotation;
  if (data.fingerprintInterval !== undefined) globalSettings.fingerprintInterval = data.fingerprintInterval;
  if (data.fingerprintList !== undefined) globalSettings.fingerprintList = data.fingerprintList;
  if (data.transportPriority !== undefined) globalSettings.transportPriority = data.transportPriority;
  if (data.autoFallback !== undefined) {
    globalSettings.autoFallback = data.autoFallback;
    setAutoFallback(data.autoFallback);
  }

  const profiles = await db.select().from(vpnProfilesTable);
  for (const profile of profiles) {
    await db.update(vpnProfilesTable).set({
      fragmentEnabled: globalSettings.fragmentEnabled,
      fragmentLength: globalSettings.fragmentLength,
      fragmentInterval: globalSettings.fragmentInterval,
      fingerprintRotation: globalSettings.fingerprintRotation,
      fingerprintInterval: globalSettings.fingerprintInterval,
      fingerprintList: globalSettings.fingerprintList,
      transportPriority: globalSettings.transportPriority,
    }).where(eq(vpnProfilesTable.id, profile.id));
  }

  res.json(UpdateAntiDpiSettingsResponse.parse(globalSettings));
});

router.post("/anti-dpi/transport-fallback/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = TriggerTransportFallbackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const result = await switchTransport(profile);
  res.json(TriggerTransportFallbackResponse.parse({
    profileId: profile.id,
    previousTransport: result.previous,
    newTransport: result.next,
    message: `Transport switched from ${result.previous} to ${result.next}`,
  }));
});

router.post("/anti-dpi/rotate-fingerprint/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = RotateFingerprintParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const result = await rotateFingerprint(profile);
  res.json(RotateFingerprintResponse.parse({
    profileId: profile.id,
    previousFingerprint: result.previous,
    newFingerprint: result.next,
    message: `Fingerprint rotated from ${result.previous} to ${result.next}`,
  }));
});

router.get("/anti-dpi/xray-config/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = GetXrayConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const config = buildXrayConfig(profile);
  res.json(GetXrayConfigResponse.parse({
    config,
    profile: profile.name,
  }));
});

export default router;
