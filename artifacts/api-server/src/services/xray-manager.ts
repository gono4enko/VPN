import { spawn, execSync, type ChildProcess } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { db, vpnUsersTable } from "@workspace/db";
import { buildServerXrayConfig } from "../lib/xray-server-config";
import { logger } from "../lib/logger";
import { trafficSnapshotsTable } from "@workspace/db/schema";

const XRAY_CONFIG_DIR = process.env.XRAY_CONFIG_DIR || path.join(process.cwd(), "xray-data");
const XRAY_CONFIG_PATH = path.join(XRAY_CONFIG_DIR, "config.json");
const XRAY_BINARY = process.env.XRAY_BINARY || "xray";
const XRAY_STATS_PORT = 10085;

let xrayProcess: ChildProcess | null = null;
let detectedVersion: string | null = null;
let processRunning = false;
let lastStartedAt: number | null = null;

interface TrafficCounter {
  inbound: number;
  outbound: number;
  lastUpdated: number;
}

let currentTraffic: TrafficCounter = { inbound: 0, outbound: 0, lastUpdated: Date.now() };
let trafficCollectorInterval: ReturnType<typeof setInterval> | null = null;

export async function detectXrayBinary(): Promise<{ installed: boolean; version: string | null; binaryPath: string | null }> {
  try {
    const output = execSync(`${XRAY_BINARY} version 2>&1`, { timeout: 5000, encoding: "utf-8" });
    const match = output.match(/Xray\s+([\d.]+)/i);
    detectedVersion = match ? `Xray ${match[1]}` : output.split("\n")[0].trim();

    let binaryPath: string | null = null;
    try {
      binaryPath = execSync(`which ${XRAY_BINARY} 2>/dev/null || where ${XRAY_BINARY} 2>/dev/null`, { timeout: 3000, encoding: "utf-8" }).trim();
    } catch {
      binaryPath = XRAY_BINARY;
    }

    return { installed: true, version: detectedVersion, binaryPath };
  } catch {
    detectedVersion = null;
    return { installed: false, version: null, binaryPath: null };
  }
}

export async function writeXrayConfig(config: object): Promise<string> {
  if (!existsSync(XRAY_CONFIG_DIR)) {
    await mkdir(XRAY_CONFIG_DIR, { recursive: true });
  }
  const configJson = JSON.stringify(config, null, 2);
  await writeFile(XRAY_CONFIG_PATH, configJson, "utf-8");
  logger.info({ path: XRAY_CONFIG_PATH }, "Xray config written to disk");
  return XRAY_CONFIG_PATH;
}

export async function startXray(): Promise<{ success: boolean; message: string }> {
  if (processRunning && xrayProcess) {
    return { success: true, message: "Xray already running" };
  }

  const detection = await detectXrayBinary();
  if (!detection.installed) {
    return { success: false, message: "Xray binary not found. Install Xray first: https://github.com/XTLS/Xray-core/releases" };
  }

  const users = await db.select().from(vpnUsersTable);
  const config = buildServerXrayConfig(users);
  await writeXrayConfig(config);

  return new Promise((resolve) => {
    let resolved = false;
    const done = (result: { success: boolean; message: string }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    try {
      xrayProcess = spawn(XRAY_BINARY, ["run", "-c", XRAY_CONFIG_PATH], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      let startupOutput = "";

      const handleOutput = (text: string) => {
        startupOutput += text;
        if (text.includes("started")) {
          processRunning = true;
          lastStartedAt = Date.now();
          logger.info("Xray process started successfully");
          startTrafficCollector();
          done({ success: true, message: `Xray started (PID: ${xrayProcess?.pid})` });
        }
      };

      xrayProcess.stderr?.on("data", (data: Buffer) => handleOutput(data.toString()));
      xrayProcess.stdout?.on("data", (data: Buffer) => handleOutput(data.toString()));

      xrayProcess.on("error", (err) => {
        processRunning = false;
        xrayProcess = null;
        logger.error({ err }, "Failed to start Xray process");
        done({ success: false, message: `Failed to start Xray: ${err.message}` });
      });

      xrayProcess.on("exit", (code, signal) => {
        processRunning = false;
        xrayProcess = null;
        stopTrafficCollector();
        logger.info({ code, signal }, "Xray process exited");
        done({ success: false, message: `Xray exited unexpectedly (code: ${code}, signal: ${signal}). Output: ${startupOutput.slice(0, 200)}` });
      });

      setTimeout(() => {
        if (!resolved && xrayProcess) {
          processRunning = true;
          lastStartedAt = Date.now();
          startTrafficCollector();
          done({ success: true, message: `Xray started (PID: ${xrayProcess.pid})` });
        } else if (!resolved) {
          done({ success: false, message: "Xray failed to start within timeout" });
        }
      }, 3000);
    } catch (err) {
      done({ success: false, message: `Failed to spawn Xray: ${(err as Error).message}` });
    }
  });
}

export async function stopXray(): Promise<{ success: boolean; message: string }> {
  stopTrafficCollector();

  if (!xrayProcess) {
    processRunning = false;
    return { success: true, message: "Xray is not running" };
  }

  return new Promise((resolve) => {
    const proc = xrayProcess!;

    proc.on("exit", () => {
      processRunning = false;
      xrayProcess = null;
      resolve({ success: true, message: "Xray stopped" });
    });

    proc.kill("SIGTERM");

    setTimeout(() => {
      if (xrayProcess) {
        proc.kill("SIGKILL");
        processRunning = false;
        xrayProcess = null;
        resolve({ success: true, message: "Xray force-stopped" });
      }
    }, 5000);
  });
}

export async function restartXray(): Promise<{ success: boolean; message: string }> {
  await stopXray();
  return startXray();
}

export async function reloadConfig(): Promise<{ success: boolean; message: string }> {
  const users = await db.select().from(vpnUsersTable);
  const config = buildServerXrayConfig(users);
  await writeXrayConfig(config);

  if (processRunning && xrayProcess) {
    return restartXray();
  }

  return { success: true, message: "Config updated (Xray not running)" };
}

export function getXrayStatus(): {
  running: boolean;
  pid: number | null;
  version: string | null;
  uptime: string | null;
  configPath: string;
} {
  let uptime: string | null = null;
  if (processRunning && lastStartedAt) {
    const ms = Date.now() - lastStartedAt;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    uptime = `${hours}h ${minutes}m`;
  }

  return {
    running: processRunning,
    pid: xrayProcess?.pid ?? null,
    version: detectedVersion,
    uptime,
    configPath: XRAY_CONFIG_PATH,
  };
}

function queryXrayStats(): { inbound: number; outbound: number } | null {
  try {
    const output = execSync(
      `${XRAY_BINARY} api stats --server=127.0.0.1:${XRAY_STATS_PORT} -pattern ""`,
      { timeout: 3000, encoding: "utf-8" }
    );

    let totalUp = 0;
    let totalDown = 0;

    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes("uplink") && line.includes("value")) {
        const match = line.match(/"value":\s*"?(\d+)"?/);
        if (match) totalUp += parseInt(match[1], 10);
      }
      if (line.includes("downlink") && line.includes("value")) {
        const match = line.match(/"value":\s*"?(\d+)"?/);
        if (match) totalDown += parseInt(match[1], 10);
      }
    }

    return { inbound: totalDown, outbound: totalUp };
  } catch {
    return null;
  }
}

function startTrafficCollector() {
  stopTrafficCollector();
  currentTraffic = { inbound: 0, outbound: 0, lastUpdated: Date.now() };

  trafficCollectorInterval = setInterval(async () => {
    const stats = queryXrayStats();
    if (stats) {
      currentTraffic.inbound = stats.inbound;
      currentTraffic.outbound = stats.outbound;
      currentTraffic.lastUpdated = Date.now();
    }

    try {
      await db.insert(trafficSnapshotsTable).values({
        inboundBytes: currentTraffic.inbound,
        outboundBytes: currentTraffic.outbound,
      });
    } catch (err) {
      logger.error({ err }, "Failed to save traffic snapshot");
    }
  }, 60000);
}

function stopTrafficCollector() {
  if (trafficCollectorInterval) {
    clearInterval(trafficCollectorInterval);
    trafficCollectorInterval = null;
  }
}

export function getCurrentTraffic(): TrafficCounter {
  return { ...currentTraffic };
}

export async function getTrafficHistory(hours = 24): Promise<Array<{ time: string; inbound: number; outbound: number }>> {
  const since = new Date(Date.now() - hours * 3600000);

  try {
    const { gte } = await import("drizzle-orm");
    const snapshots = await db
      .select()
      .from(trafficSnapshotsTable)
      .where(gte(trafficSnapshotsTable.createdAt, since))
      .orderBy(trafficSnapshotsTable.createdAt);

    if (snapshots.length === 0) {
      const now = new Date();
      return Array.from({ length: hours }, (_, i) => ({
        time: new Date(now.getTime() - (hours - 1 - i) * 3600000).toISOString(),
        inbound: 0,
        outbound: 0,
      }));
    }

    const hourlyBuckets = new Map<string, { inbound: number; outbound: number }>();
    for (const snap of snapshots) {
      const hourKey = new Date(snap.createdAt).toISOString().slice(0, 13) + ":00:00.000Z";
      const existing = hourlyBuckets.get(hourKey) || { inbound: 0, outbound: 0 };
      existing.inbound = Math.max(existing.inbound, snap.inboundBytes);
      existing.outbound = Math.max(existing.outbound, snap.outboundBytes);
      hourlyBuckets.set(hourKey, existing);
    }

    const now = new Date();
    return Array.from({ length: hours }, (_, i) => {
      const time = new Date(now.getTime() - (hours - 1 - i) * 3600000);
      const key = time.toISOString().slice(0, 13) + ":00:00.000Z";
      const bucket = hourlyBuckets.get(key) || { inbound: 0, outbound: 0 };
      return {
        time: time.toISOString(),
        inbound: Math.round(bucket.inbound / 1024 / 1024),
        outbound: Math.round(bucket.outbound / 1024 / 1024),
      };
    });
  } catch {
    const now = new Date();
    return Array.from({ length: hours }, (_, i) => ({
      time: new Date(now.getTime() - (hours - 1 - i) * 3600000).toISOString(),
      inbound: 0,
      outbound: 0,
    }));
  }
}

export async function initXrayManager() {
  const detection = await detectXrayBinary();
  if (detection.installed) {
    logger.info({ version: detection.version }, "Xray binary detected");
    const result = await startXray();
    if (result.success) {
      logger.info(result.message);
    } else {
      logger.warn({ message: result.message }, "Xray auto-start failed (will retry on manual restart)");
    }
  } else {
    logger.warn("Xray binary not found - VPN features will be unavailable until Xray is installed");
  }
}
