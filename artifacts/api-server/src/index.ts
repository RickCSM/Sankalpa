import { sql } from "drizzle-orm";
import app from "./app";
import { logger } from "./lib/logger";
import { runSeed, runProductionBootstrapRemediation, runMasterDataSeed } from "./seed";
import { db } from "@workspace/db";

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
  // Hard gate: refuse to start if the database is unreachable.
  // A broken server that silently loses every write is worse than no server.
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connectivity confirmed");
  } catch (err) {
    logger.fatal({ err }, "FATAL: database unreachable — aborting startup");
    process.exit(1);
  }

  if (process.env["NODE_ENV"] !== "production") {
    await runSeed();
    logger.info("Seed completed");
  } else {
    await runProductionBootstrapRemediation();
    logger.info("Production bootstrap remediation completed");
    // Idempotent master-data seed (districts/blocks/occasions + any new
    // departments/categories/tags). Safe to re-run on every boot — it only
    // inserts rows missing by name. Required so prod can serve the new
    // master-driven dropdowns immediately after schema migration.
    await runMasterDataSeed();
    logger.info("Master-data seed completed");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.fatal({ err }, "FATAL: unhandled startup error");
  process.exit(1);
});
