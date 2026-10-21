import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";

test("direct status updates persist author/history, preserve workflow, and enforce API gates", {
  skip: !process.env.DATABASE_URL, timeout: 30_000,
}, async () => {
  const { db, announcementsTable, departmentsTable, usersTable, announcementCommentsTable, subComponentsTable, auditLogTable } = await import("@workspace/db");
  const { default: router } = await import("../routes/announcements");
  const { errorHandler } = await import("./errors");
  const pool = db.$client;
  const connection = await pool.connect();
  const originalQuery = pool.query;
  const originalTransaction = db.transaction;
  // A private outer transaction keeps all fixtures and writes invisible to the
  // running app. Request transactions become savepoints on this connection.
  pool.query = connection.query.bind(connection) as typeof pool.query;
  db.transaction = (async (callback: (tx: typeof db) => Promise<unknown>) => {
    await connection.query("SAVEPOINT status_update_request");
    try {
      const result = await callback(db);
      await connection.query("RELEASE SAVEPOINT status_update_request");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK TO SAVEPOINT status_update_request");
      await connection.query("RELEASE SAVEPOINT status_update_request");
      throw error;
    }
  }) as unknown as typeof db.transaction;
  const actors = new Map<string, object>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: actors.get(String(req.headers["x-test-actor"] ?? "owner")) } as typeof req.session;
    next();
  });
  app.use("/api", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await connection.query("BEGIN");
    const prefix = `status-update-${randomUUID()}`;
    const [department, foreignDepartment] = await db.insert(departmentsTable).values([
      { name: prefix }, { name: `${prefix}-foreign` },
    ]).returning();
    const [owner, other, reviewer] = await db.insert(usersTable).values([
      { username: `${prefix}-owner`, name: "Nodal Owner", role: "dept_nodal" as const, departmentId: department!.id, passwordHash: "invalid-fixture", email: "fixture@example.invalid" },
      { username: `${prefix}-other`, name: "Other Nodal", role: "dept_nodal" as const, departmentId: department!.id, passwordHash: "invalid-fixture", email: "fixture@example.invalid" },
      { username: `${prefix}-reviewer`, name: "Reviewer", role: "dept_reviewer" as const, departmentId: department!.id, passwordHash: "invalid-fixture", email: "fixture@example.invalid" },
    ]).returning();
    for (const [key, user] of [["owner", owner!], ["other", other!], ["reviewer", reviewer!]] as const) {
      actors.set(key, { ...user, department: department!.name });
    }
    actors.set("transferred", { ...owner!, department: foreignDepartment!.name });
    const [announcement] = await db.insert(announcementsTable).values({
      uniqueId: prefix, title: prefix, date: "2026-10-21", departmentId: department!.id,
      createdBy: owner!.id, acceptedByDeptNodalId: owner!.id, workflowStatus: "in_progress",
    }).returning();
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    const post = (body: object, actor = "owner") => fetch(`${base}/announcements/${announcement!.id}/status-updates`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-actor": actor },
      body: JSON.stringify(body),
    });
    const initialVersion = announcement!.version;
    for (const actor of ["other", "reviewer", "transferred"]) {
      assert.equal((await post({ version: initialVersion, comment: "Unauthorized" }, actor)).status, 403, actor);
    }
    assert.equal((await post({ version: initialVersion, comment: " " })).status, 400);
    assert.equal((await post({ version: initialVersion, comment: "x".repeat(2001) })).status, 400);
    const saved = await post({ version: initialVersion, comment: "  Inspection completed; awaiting materials.  ", userId: other!.id });
    assert.equal(saved.status, 200);
    const data = await saved.json() as { announcement: { workflowStatus: string; version: number } };
    assert.equal(data.announcement.workflowStatus, "in_progress");
    assert.equal(data.announcement.version, initialVersion + 1);
    const comments = await db.select().from(announcementCommentsTable).where(eq(announcementCommentsTable.announcementId, announcement!.id));
    assert.equal(comments.length, 1);
    assert.equal(comments[0]!.comment, "Inspection completed; awaiting materials.");
    assert.equal(comments[0]!.userId, owner!.id);
    assert.equal(comments[0]!.action, "Status Update");
    assert.ok(comments[0]!.createdAt);
    const history = await fetch(`${base}/comments?announcementId=${announcement!.id}`, { headers: { "x-test-actor": "reviewer" } });
    assert.equal(history.status, 200);
    assert.equal((await history.json() as { comments: { comment: string }[] }).comments[0]!.comment, comments[0]!.comment);
    const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, announcement!.id));
    assert.ok(audits.some(row => row.action === "announcement.status_update"));
    assert.equal((await post({ version: initialVersion, comment: "Stale" })).status, 409);
    const [sub] = await db.insert(subComponentsTable).values({
      announcementId: announcement!.id, title: "Existing work", assignedTo: owner!.id,
    }).returning();
    assert.equal((await post({ version: initialVersion + 1, comment: "Use sub-task instead" })).status, 409);
    await db.delete(subComponentsTable).where(eq(subComponentsTable.id, sub!.id));
    await db.update(announcementsTable).set({ workflowStatus: "accepted" }).where(eq(announcementsTable.id, announcement!.id));
    assert.equal((await post({ version: initialVersion + 1, comment: "Not yet started" })).status, 409);
    const remaining = await db.select().from(announcementCommentsTable).where(eq(announcementCommentsTable.announcementId, announcement!.id));
    assert.equal(remaining.length, 1, "Rejected requests must not write history");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await connection.query("ROLLBACK");
    pool.query = originalQuery;
    db.transaction = originalTransaction;
    connection.release();
  }
});
