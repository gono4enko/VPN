import app from "./app";
import { logger } from "./lib/logger";
import { startMonitor } from "./lib/anti-dpi-monitor";
import { initMonitoringOnBoot } from "./services/monitoring";
import { startSyncEngine } from "./services/sync-engine";
import { initRealityKeys } from "./lib/reality-keys";

startMonitor();
startSyncEngine();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  await initRealityKeys();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    initMonitoringOnBoot().catch((bootErr) => {
      logger.error({ err: bootErr }, "Failed to initialize monitoring on boot");
    });
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
