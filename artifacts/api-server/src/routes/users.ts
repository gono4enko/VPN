import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { db, vpnUsersTable } from "@workspace/db";
import type { VpnUser } from "@workspace/db/schema";
import { recordChange } from "../services/sync-engine";
import {
  CreateUserBody,
  ListUsersResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  DeleteUserParams,
  BlockUserParams,
  BlockUserResponse,
  UnblockUserParams,
  UnblockUserResponse,
  GetUserQrParams,
  GetUserQrResponse,
  GetUserVlessUrlParams,
  GetUserVlessUrlResponse,
} from "@workspace/api-zod";
import { getRealityPublicKey, getRealityShortId } from "../lib/reality-keys";
import { reloadConfig } from "../services/xray-manager";

const router: IRouter = Router();

const OFFICE_IP = process.env.OFFICE_IP || "happ.su";
const OFFICE_PORT = process.env.OFFICE_PORT || "443";
const OFFICE_SNI = process.env.OFFICE_SNI || "happ.su";

function buildVlessUrl(uuid: string, name: string): string {
  const pbk = getRealityPublicKey();
  const sid = getRealityShortId();
  return `vless://${uuid}@${OFFICE_IP}:${OFFICE_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${OFFICE_SNI}&fp=random&pbk=${pbk}&sid=${sid}&type=tcp#${encodeURIComponent(name)}`;
}

function formatUser(user: VpnUser) {
  return {
    id: user.id,
    name: user.name,
    uuid: user.uuid,
    flow: user.flow,
    trafficLimit: user.trafficLimit,
    trafficUsed: user.trafficUsed,
    status: user.status,
    expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(vpnUsersTable).orderBy(vpnUsersTable.createdAt);
  res.json(ListUsersResponse.parse(users.map(formatUser)));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const newUuid = uuidv4();
  const [user] = await db.insert(vpnUsersTable).values({
    name: parsed.data.name,
    uuid: newUuid,
    trafficLimit: parsed.data.trafficLimit,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  }).returning();

  await recordChange("vpn_user", user.uuid, "create", {
    name: user.name,
    uuid: user.uuid,
    flow: user.flow,
    trafficLimit: user.trafficLimit,
    trafficUsed: user.trafficUsed,
    status: user.status,
  });

  reloadConfig().catch(() => {});

  res.status(201).json(formatUser(user));
});

router.put("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<{ name: string; trafficLimit: number; expiresAt: Date | null }> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.trafficLimit !== undefined) updateData.trafficLimit = parsed.data.trafficLimit;
  if (parsed.data.expiresAt !== undefined) updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  const [user] = await db.update(vpnUsersTable).set(updateData).where(eq(vpnUsersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await recordChange("vpn_user", user.uuid, "update", {
    name: user.name,
    uuid: user.uuid,
    flow: user.flow,
    trafficLimit: user.trafficLimit,
    trafficUsed: user.trafficUsed,
    status: user.status,
  });

  res.json(UpdateUserResponse.parse(formatUser(user)));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(vpnUsersTable).where(eq(vpnUsersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await recordChange("vpn_user", user.uuid, "delete");

  reloadConfig().catch(() => {});

  res.sendStatus(204);
});

router.post("/users/:id/block", async (req, res): Promise<void> => {
  const params = BlockUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.update(vpnUsersTable).set({ status: "blocked" }).where(eq(vpnUsersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await recordChange("vpn_user", user.uuid, "update", {
    name: user.name, uuid: user.uuid, flow: user.flow,
    trafficLimit: user.trafficLimit, trafficUsed: user.trafficUsed, status: user.status,
  });

  reloadConfig().catch(() => {});

  res.json(BlockUserResponse.parse(formatUser(user)));
});

router.post("/users/:id/unblock", async (req, res): Promise<void> => {
  const params = UnblockUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.update(vpnUsersTable).set({ status: "active" }).where(eq(vpnUsersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await recordChange("vpn_user", user.uuid, "update", {
    name: user.name, uuid: user.uuid, flow: user.flow,
    trafficLimit: user.trafficLimit, trafficUsed: user.trafficUsed, status: user.status,
  });

  reloadConfig().catch(() => {});

  res.json(UnblockUserResponse.parse(formatUser(user)));
});

router.get("/users/:id/qr", async (req, res): Promise<void> => {
  const params = GetUserQrParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(vpnUsersTable).where(eq(vpnUsersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const vlessUrl = buildVlessUrl(user.uuid, user.name);
  const qrDataUrl = await QRCode.toDataURL(vlessUrl, { width: 300, margin: 2 });

  res.json(GetUserQrResponse.parse({ qrDataUrl, vlessUrl }));
});

router.get("/users/:id/vless-url", async (req, res): Promise<void> => {
  const params = GetUserVlessUrlParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(vpnUsersTable).where(eq(vpnUsersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const vlessUrl = buildVlessUrl(user.uuid, user.name);
  res.json(GetUserVlessUrlResponse.parse({ vlessUrl }));
});

export default router;
