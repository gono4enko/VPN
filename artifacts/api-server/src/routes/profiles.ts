import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vpnProfilesTable } from "@workspace/db";
import type { VpnProfile } from "@workspace/db/schema";
import {
  CreateProfileBody,
  ListProfilesResponse,
  ImportProfileUrlBody,
  ImportProfileSubBody,
  ImportProfileSubResponse,
  UpdateProfileParams,
  UpdateProfileBody,
  UpdateProfileResponse,
  DeleteProfileParams,
  ActivateProfileParams,
  ActivateProfileResponse,
  PingProfileParams,
  PingProfileResponse,
} from "@workspace/api-zod";
import { measureNode } from "../services/tcp-ping";

const router: IRouter = Router();

function formatProfile(profile: VpnProfile) {
  return {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    address: profile.address,
    port: profile.port,
    uuid: profile.uuid || "",
    flow: profile.flow || "",
    security: profile.security || "",
    sni: profile.sni || "",
    publicKey: profile.publicKey || "",
    shortId: profile.shortId || "",
    fingerprint: profile.fingerprint || "",
    country: profile.country || "Unknown",
    countryFlag: profile.countryFlag || "🌐",
    isActive: profile.isActive,
    lastPing: profile.lastPing,
    lastDownloadSpeed: profile.lastDownloadSpeed ?? null,
    lastCheckAt: profile.lastCheckAt ? profile.lastCheckAt.toISOString() : null,
    isOnline: profile.isOnline,
    status: profile.status,
    transportType: profile.transportType || "tcp",
    transportPath: profile.transportPath || "",
    transportHost: profile.transportHost || "",
    fragmentEnabled: profile.fragmentEnabled ?? true,
    fragmentLength: profile.fragmentLength || "100-200",
    fragmentInterval: profile.fragmentInterval || "10-20",
    fingerprintRotation: profile.fingerprintRotation ?? true,
    fingerprintInterval: profile.fingerprintInterval || 360,
    fingerprintList: (profile.fingerprintList as string[]) || ["chrome", "firefox", "safari", "edge", "random"],
    transportPriority: (profile.transportPriority as string[]) || ["tcp", "ws", "grpc", "h2"],
    lastFingerprintRotation: profile.lastFingerprintRotation ? profile.lastFingerprintRotation.toISOString() : null,
    createdAt: profile.createdAt.toISOString(),
  };
}

function parseVlessUrl(url: string) {
  const match = url.match(/^vless:\/\/([^@]+)@([^:]+):(\d+)\??([^#]*)(?:#(.*))?$/);
  if (!match) return null;

  const [, uuid, address, port, paramsStr, fragment] = match;
  const params = new URLSearchParams(paramsStr);
  const name = decodeURIComponent(fragment || address);

  const typeParam = params.get("type") || "tcp";

  return {
    uuid,
    address,
    port: parseInt(port, 10),
    name,
    flow: params.get("flow") || "",
    security: params.get("security") || "",
    sni: params.get("sni") || "",
    publicKey: params.get("pbk") || "",
    shortId: params.get("sid") || "",
    fingerprint: params.get("fp") || "random",
    transportType: typeParam,
    transportPath: params.get("path") || params.get("serviceName") || "",
    transportHost: params.get("host") || "",
  };
}

router.get("/profiles", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(vpnProfilesTable).orderBy(vpnProfilesTable.createdAt);
  res.json(ListProfilesResponse.parse(profiles.map(formatProfile)));
});

router.post("/profiles", async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db.insert(vpnProfilesTable).values({
    name: parsed.data.name,
    protocol: parsed.data.protocol,
    address: parsed.data.address,
    port: parsed.data.port,
    uuid: parsed.data.uuid || "",
    flow: parsed.data.flow || "",
    security: parsed.data.security || "",
    sni: parsed.data.sni || "",
    publicKey: parsed.data.publicKey || "",
    shortId: parsed.data.shortId || "",
    fingerprint: parsed.data.fingerprint || "random",
    country: parsed.data.country || "Unknown",
    countryFlag: parsed.data.countryFlag || "🌐",
    transportType: parsed.data.transportType || "tcp",
    transportPath: parsed.data.transportPath || "",
    transportHost: parsed.data.transportHost || "",
    fragmentEnabled: parsed.data.fragmentEnabled ?? true,
    fragmentLength: parsed.data.fragmentLength || "100-200",
    fragmentInterval: parsed.data.fragmentInterval || "10-20",
    fingerprintRotation: parsed.data.fingerprintRotation ?? true,
    fingerprintInterval: parsed.data.fingerprintInterval || 360,
    fingerprintList: parsed.data.fingerprintList || ["chrome", "firefox", "safari", "edge", "random"],
    transportPriority: parsed.data.transportPriority || ["tcp", "ws", "grpc", "h2"],
  }).returning();

  res.status(201).json(formatProfile(profile));
});

router.post("/profiles/import-url", async (req, res): Promise<void> => {
  const parsed = ImportProfileUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const profileData = parseVlessUrl(parsed.data.url);
  if (!profileData) {
    res.status(400).json({ error: "Invalid VLESS URL format" });
    return;
  }

  const [profile] = await db.insert(vpnProfilesTable).values({
    name: profileData.name,
    protocol: "vless",
    address: profileData.address,
    port: profileData.port,
    uuid: profileData.uuid,
    flow: profileData.flow,
    security: profileData.security,
    sni: profileData.sni,
    publicKey: profileData.publicKey,
    shortId: profileData.shortId,
    fingerprint: profileData.fingerprint,
    transportType: profileData.transportType,
    transportPath: profileData.transportPath,
    transportHost: profileData.transportHost,
  }).returning();

  res.status(201).json(formatProfile(profile));
});

router.post("/profiles/import-sub", async (req, res): Promise<void> => {
  const parsed = ImportProfileSubBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const subUrl = new URL(parsed.data.subscriptionUrl);
    if (!["http:", "https:"].includes(subUrl.protocol)) {
      res.status(400).json({ error: "Only HTTP(S) URLs are allowed" });
      return;
    }
    const hostname = subUrl.hostname.replace(/^\[|\]$/g, "");
    const isPrivateIp = (ip: string): boolean => {
      if (/^127\./.test(ip)) return true;
      if (/^10\./.test(ip)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
      if (/^192\.168\./.test(ip)) return true;
      if (/^169\.254\./.test(ip)) return true;
      if (/^0\./.test(ip) || ip === "0.0.0.0") return true;
      if (ip === "::1" || ip === "::") return true;
      if (/^f[cd]/i.test(ip)) return true;
      if (/^fe80/i.test(ip)) return true;
      return false;
    };
    if (isPrivateIp(hostname) ||
        hostname === "localhost" ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".localhost")) {
      res.status(400).json({ error: "Internal/private URLs are not allowed" });
      return;
    }
    const dns = await import("node:dns");
    const { resolve4, resolve6 } = dns.promises;
    try {
      const ipv4s = await resolve4(hostname).catch(() => [] as string[]);
      const ipv6s = await resolve6(hostname).catch(() => [] as string[]);
      const allIps = [...ipv4s, ...ipv6s];
      if (allIps.some(isPrivateIp)) {
        res.status(400).json({ error: "URL resolves to a private/internal IP" });
        return;
      }
    } catch {}
    const response = await fetch(parsed.data.subscriptionUrl, { redirect: "error" });
    const text = await response.text();
    const decoded = Buffer.from(text, "base64").toString("utf-8");
    const lines = decoded.split("\n").filter((l) => l.trim().startsWith("vless://"));

    const profiles = [];
    for (const line of lines) {
      const profileData = parseVlessUrl(line.trim());
      if (profileData) {
        const [profile] = await db.insert(vpnProfilesTable).values({
          name: profileData.name,
          protocol: "vless",
          address: profileData.address,
          port: profileData.port,
          uuid: profileData.uuid,
          flow: profileData.flow,
          security: profileData.security,
          sni: profileData.sni,
          publicKey: profileData.publicKey,
          shortId: profileData.shortId,
          fingerprint: profileData.fingerprint,
          transportType: profileData.transportType,
          transportPath: profileData.transportPath,
          transportHost: profileData.transportHost,
        }).returning();
        profiles.push(formatProfile(profile));
      }
    }

    res.json(ImportProfileSubResponse.parse(profiles));
  } catch {
    res.status(400).json({ error: "Failed to fetch or parse subscription" });
    return;
  }
});

router.put("/profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updateData[key] = value;
  }

  const [profile] = await db.update(vpnProfilesTable).set(updateData).where(eq(vpnProfilesTable.id, params.data.id)).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(UpdateProfileResponse.parse(formatProfile(profile)));
});

router.delete("/profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.delete(vpnProfilesTable).where(eq(vpnProfilesTable.id, params.data.id)).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/profiles/:id/activate", async (req, res): Promise<void> => {
  const params = ActivateProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.update(vpnProfilesTable).set({ isActive: false }).where(eq(vpnProfilesTable.isActive, true));

  const [profile] = await db.update(vpnProfilesTable).set({ isActive: true, status: "active" }).where(eq(vpnProfilesTable.id, params.data.id)).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(ActivateProfileResponse.parse(formatProfile(profile)));
});

router.get("/profiles/:id/ping", async (req, res): Promise<void> => {
  const params = PingProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(vpnProfilesTable).where(eq(vpnProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const measurement = await measureNode(
    profile.address,
    profile.port,
    profile.security || undefined,
    profile.sni || undefined
  );

  await db.update(vpnProfilesTable).set({
    lastPing: measurement.ping,
    lastDownloadSpeed: measurement.downloadSpeed,
    lastCheckAt: new Date(),
    isOnline: measurement.isOnline,
  }).where(eq(vpnProfilesTable.id, params.data.id));

  res.json(PingProfileResponse.parse({
    profileId: profile.id,
    ping: measurement.ping,
    status: measurement.isOnline ? "ok" : "timeout",
  }));
});

export default router;
