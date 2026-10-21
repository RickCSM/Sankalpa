import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";

test("Currently With follows real workflow data, viewer scopes and server-side pagination", {
  skip: !process.env.DATABASE_URL, timeout: 45_000,
}, async () => {
  const { db, usersTable, departmentsTable, designationsTable, announcementsTable, userRoles, workflowStatuses } = await import("@workspace/db");
  const { default: router } = await import("../routes/announcements");
  const { errorHandler } = await import("./errors");
  // A private transaction in this test process keeps fixtures invisible to the
  // running application and guarantees rollback, including on assertion failure.
  // Only GET routes are exercised, so all pool queries can use this connection.
  const pool = db.$client;
  const connection = await pool.connect();
  const originalQuery = pool.query;
  pool.query = connection.query.bind(connection) as typeof pool.query;
  const app = express();
  const actors = new Map<string, { id: number; name: string; role: string; department: string }>();
  app.use((req, _res, next) => {
    req.session = { user: actors.get(String(req.headers["x-test-role"] ?? "admin")) } as typeof req.session;
    next();
  });
  app.use("/api", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await connection.query("BEGIN");
    const prefix = `currently-with-${randomUUID()}`;
    const [department, otherDepartment] = await db.insert(departmentsTable)
      .values([{ name: prefix, isActive: true }, { name: `${prefix}-other`, isActive: true }]).returning();
    const [designation] = await db.insert(designationsTable)
      .values({ name: `${prefix}-Director`, isActive: true }).returning();
    for (const role of userRoles) {
      const [actor] = await db.insert(usersTable).values({
        username: `${prefix}-${role}`, passwordHash: "invalid-test-hash",
        name: `Fixture ${role}`, role, departmentId: department!.id,
        designationId: designation!.id, email: "fixture@example.invalid",
      }).returning();
      actors.set(role, { id: actor!.id, name: actor!.name, role, department: department!.name });
    }
    const [extraReviewer, foreignReviewer, inactiveReviewer] = await db.insert(usersTable).values([
      { username: `${prefix}-extra`, passwordHash: "invalid-test-hash", name: "Extra Department Reviewer", role: "dept_reviewer" as const,
        departmentId: department!.id, email: "fixture@example.invalid" },
      { username: `${prefix}-foreign`, passwordHash: "invalid-test-hash", name: "Foreign Reviewer", role: "dept_reviewer" as const,
        departmentId: otherDepartment!.id, email: "fixture@example.invalid" },
      { username: `${prefix}-inactive`, passwordHash: "invalid-test-hash", name: "Inactive Reviewer", role: "dept_reviewer" as const,
        departmentId: department!.id, email: "fixture@example.invalid", status: "Inactive" as const },
    ]).returning();
    const rows = await db.insert(announcementsTable).values(workflowStatuses.map(status => ({
      uniqueId: `${prefix}-${status}`, title: `${prefix} ${status}`, date: "2026-10-21",
      departmentId: department!.id, workflowStatus: status,
      createdBy: actors.get("cmo_nodal")!.id, assignedCmoReviewerId: actors.get("cmo_reviewer")!.id,
    }))).returning();
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    const list = async (role = "admin", extra = "") => {
      const query = new URLSearchParams({ search: prefix, pageSize: "200" });
      for (const [key, value] of new URLSearchParams(extra.replace(/^&/, ""))) query.set(key, value);
      const response = await fetch(`${base}/announcements?${query}`, { headers: { "x-test-role": role } });
      assert.equal(response.status, 200);
      return response.json() as Promise<{ announcements: { id: number; workflowStatus: string; currentlyWith: string }[]; total: number }>;
    };
    const byStatus = (data: Awaited<ReturnType<typeof list>>, status: string) => {
      const row = data.announcements.find(item => item.workflowStatus === status);
      assert.ok(row, `Missing ${status}`);
      return row.currentlyWith;
    };
    const initial = await list();
    assert.equal(initial.total, workflowStatuses.length);
    const cmoLabel = `${actors.get("cmo_reviewer")!.name} — ${designation!.name}`;
    const departmentLabel = `${extraReviewer!.name} — Designation not assigned\n${actors.get("dept_reviewer")!.name} — ${designation!.name}`;
    assert.equal(byStatus(initial, "pending_cmo_review"), cmoLabel);
    assert.equal(byStatus(initial, "pending_cmo_completion_review"), cmoLabel);
    for (const status of ["pending_dept_acceptance", "pending_completion_review"]) {
      assert.equal(byStatus(initial, status), departmentLabel);
      assert.ok(!byStatus(initial, status).includes(foreignReviewer!.name));
      assert.ok(!byStatus(initial, status).includes(inactiveReviewer!.name));
    }
    for (const role of userRoles) {
      const data = await list(role);
      // Department viewers can see a pending CMO completion review without
      // having CMO users in their own directory or access to Designation Master.
      assert.equal(byStatus(data, "pending_cmo_completion_review"), cmoLabel, role);
      assert.equal(byStatus(data, "pending_completion_review"), departmentLabel, role);
      if (role.startsWith("dept_")) {
        assert.ok(!data.announcements.some(row => ["draft", "pending_cmo_review", "reverted_by_cmo"].includes(row.workflowStatus)), role);
      }
      if (["chief_minister", "ocac_viewer", "cmo_reviewer"].includes(role)) {
        assert.ok(!data.announcements.some(row => row.workflowStatus === "draft"), role);
      }
    }
    for (const [status, label] of Object.entries({
      draft: "—", published: "Approved", accepted: "—", in_progress: "—",
      reverted_by_cmo: "Returned for correction", reverted_by_dept_reviewer: "Returned for correction",
      pending_cmo_reconsideration: "Reconsideration requested", completed: "Completed", dropped: "Dropped", on_hold: "On hold",
    })) assert.equal(byStatus(initial, status), label);

    const pending = rows.find(row => row.workflowStatus === "pending_cmo_review")!;
    await db.update(announcementsTable).set({ workflowStatus: "pending_completion_review" }).where(eq(announcementsTable.id, pending.id));
    let detail = await fetch(`${base}/announcements/${pending.id}`, { headers: { "x-test-role": "dept_user" } });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { announcement: { currentlyWith: string } }).announcement.currentlyWith, departmentLabel);
    await db.update(announcementsTable).set({ workflowStatus: "pending_cmo_completion_review" }).where(eq(announcementsTable.id, pending.id));
    detail = await fetch(`${base}/announcements/${pending.id}`, { headers: { "x-test-role": "dept_user" } });
    assert.equal((await detail.json() as { announcement: { currentlyWith: string } }).announcement.currentlyWith, cmoLabel);
    await db.update(usersTable).set({ status: "Inactive" }).where(eq(usersTable.id, actors.get("cmo_reviewer")!.id));
    assert.equal(byStatus(await list(), "pending_cmo_completion_review"), "Assigned CMO Reviewer unavailable");
    await db.update(usersTable).set({ status: "Active" }).where(eq(usersTable.id, actors.get("cmo_reviewer")!.id));
    await db.update(announcementsTable).set({ assignedCmoReviewerId: null }).where(eq(announcementsTable.id, pending.id));
    detail = await fetch(`${base}/announcements/${pending.id}`, { headers: { "x-test-role": "admin" } });
    assert.ok((await detail.json() as { announcement: { currentlyWith: string } }).announcement.currentlyWith.includes(cmoLabel));
    await db.update(usersTable).set({ status: "Inactive" }).where(eq(usersTable.id, actors.get("dept_reviewer")!.id));
    await db.update(usersTable).set({ status: "Inactive" }).where(eq(usersTable.id, extraReviewer!.id));
    assert.equal(byStatus(await list(), "pending_completion_review"), "Awaiting Department Reviewer assignment");

    for (const direction of ["asc", "desc"]) {
      const all = await list("admin", `&sortBy=currentlyWith&sortDir=${direction}`);
      for (const page of [1, 2, 3]) {
        const paged = await list("admin", `&sortBy=currentlyWith&sortDir=${direction}&pageSize=1&page=${page}`);
        assert.equal(paged.total, workflowStatuses.length);
        assert.equal(paged.announcements.length, 1);
        assert.equal(paged.announcements[0]!.id, all.announcements[page - 1]!.id);
      }
    }
    const filtered = await list("dept_nodal", "&status=pending_completion_review");
    assert.ok(filtered.announcements.every(row => row.workflowStatus === "pending_completion_review"));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await connection.query("ROLLBACK");
    pool.query = originalQuery;
    connection.release();
    await pool.end();
  }
});
