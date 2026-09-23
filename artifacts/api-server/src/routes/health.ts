import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

const START_TIME = Date.now();

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) });
});

router.get("/health", async (_req, res) => {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", db: "connected", uptime });
  } catch (err) {
    logger.error({ err }, "health check failed");
    res.status(503).json({ status: "degraded", db: "unreachable", uptime });
  }
});

export default router;
