import crypto from "crypto";
import { db, serverSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SETTING_KEYS = {
  privateKey: "reality_private_key",
  publicKey: "reality_public_key",
  shortId: "reality_short_id",
} as const;

let cachedPublicKey: string | null = null;
let cachedShortId: string | null = null;

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(serverSettingsTable)
    .where(eq(serverSettingsTable.key, key));
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(serverSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: serverSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

function generateX25519KeyPair(): { privateKey: string; publicKey: string } {
  const keyPair = crypto.generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const rawPublic = keyPair.publicKey.subarray(-32);
  const rawPrivate = keyPair.privateKey.subarray(-32);

  return {
    privateKey: Buffer.from(rawPrivate).toString("base64url"),
    publicKey: Buffer.from(rawPublic).toString("base64url"),
  };
}

function generateShortId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export async function initRealityKeys(): Promise<void> {
  const existingPublicKey = await getSetting(SETTING_KEYS.publicKey);
  const existingPrivateKey = await getSetting(SETTING_KEYS.privateKey);
  const existingShortId = await getSetting(SETTING_KEYS.shortId);

  if (existingPublicKey && existingPrivateKey && existingShortId) {
    cachedPublicKey = existingPublicKey;
    cachedShortId = existingShortId;
    logger.info("REALITY keys loaded from database");
    return;
  }

  const { privateKey, publicKey } = generateX25519KeyPair();
  const shortId = generateShortId();

  await setSetting(SETTING_KEYS.privateKey, privateKey);
  await setSetting(SETTING_KEYS.publicKey, publicKey);
  await setSetting(SETTING_KEYS.shortId, shortId);

  cachedPublicKey = publicKey;
  cachedShortId = shortId;

  logger.info("REALITY keys generated and stored");
}

function isValidOverride(value: string | undefined): value is string {
  if (!value) return false;
  const lower = value.toLowerCase();
  return !lower.includes("replace") && !lower.includes("placeholder") && value.trim().length > 0;
}

export function getRealityPublicKey(): string {
  const envOverride = process.env.OFFICE_PUBLIC_KEY;
  if (isValidOverride(envOverride)) return envOverride;
  return cachedPublicKey ?? "";
}

export function getRealityShortId(): string {
  const envOverride = process.env.OFFICE_SHORT_ID;
  if (isValidOverride(envOverride)) return envOverride;
  return cachedShortId ?? "";
}
