#!/usr/bin/env node
// Notification matrix verification.
//
// Walks an end-to-end announcement workflow on the running API server and,
// after each transition, asserts that the set of *roles* that received a new
// notification matches the documented matrix in
// `artifacts/sankalpa-odisha/src/context/AppStateContext.tsx`.
//
// Usage:
//   API_URL=http://localhost:8080 node artifacts/api-server/scripts/check-matrix.mjs
//
// Exits 0 on full success, 1 on the first mismatch.

import pg from "pg";

const API = process.env.API_URL ?? "http://localhost:8080";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED_PASSWORDS = {
  admin: "Admin@123",
  cm: "Cm@12345",
  cmo_nodal: "Cmo@123",
  cmo_reviewer: "Cmo@123",
  dept_head: "Dept@123",
  dept_nodal: "Dept@123",
  dept_reviewer: "Dept@123",
};

let pass = 0;
let fail = 0;

function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

async function login(username) {
  const password = SEED_PASSWORDS[username];
  if (!password) throw new Error(`No seed password for ${username}`);
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`No cookie returned for ${username}`);
  return cookie;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return data;
}

async function getAnnouncementVersion(id) {
  const r = await pool.query(`SELECT version, workflow_status FROM announcements WHERE id = $1`, [id]);
  return r.rows[0];
}

async function rolesNotifiedSince(maxId) {
  const r = await pool.query(
    `SELECT DISTINCT u.role
       FROM notifications n
       JOIN users u ON u.id = n.user_id
      WHERE n.id > $1
      ORDER BY u.role`,
    [maxId],
  );
  return new Set(r.rows.map((row) => row.role));
}

async function maxNotificationId() {
  const r = await pool.query(`SELECT COALESCE(MAX(id), 0) AS m FROM notifications`);
  return Number(r.rows[0].m);
}

async function expect(label, actualSet, expectedRoles) {
  const expected = new Set(expectedRoles);
  if (setEq(actualSet, expected)) {
    pass++;
    console.log(`  ✓ ${label} → [${[...expected].sort().join(", ")}]`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
    console.log(`     expected: [${[...expected].sort().join(", ")}]`);
    console.log(`     actual:   [${[...actualSet].sort().join(", ")}]`);
  }
}

async function main() {
  console.log("Notification matrix verification\n");

  const cmoNodal = await login("cmo_nodal");
  const cmoReviewer = await login("cmo_reviewer");
  const deptNodal = await login("dept_nodal");
  const deptReviewer = await login("dept_reviewer");

  // ---- Event 1: addAnnouncement ----------------------------------------
  let cursor = await maxNotificationId();
  const created = await api(cmoNodal, "POST", "/api/announcements", {
    house: "A",
    constituencyNumber: 99,
    title: `Matrix Check ${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    description: "matrix verification",
    department: "Agriculture & Farmers' Emp",
    occasion: "Audit",
    location: "Bhubaneswar",
    tags: ["Matrix"],
  });
  const ann = created.announcement;
  await expect("addAnnouncement → cmo_reviewer", await rolesNotifiedSince(cursor), ["cmo_reviewer"]);

  // ---- Event 2: reviewAnnouncement / approve ---------------------------
  cursor = await maxNotificationId();
  let v = (await getAnnouncementVersion(ann.id)).version;
  await api(cmoReviewer, "POST", `/api/announcements/${ann.id}/review`, {
    version: v, action: "approve", comment: "matrix approve",
  });
  await expect(
    "reviewAnnouncement/approve → dept_head + dept_nodal + dept_reviewer + creator(cmo_nodal)",
    await rolesNotifiedSince(cursor),
    ["dept_head", "dept_nodal", "dept_reviewer", "cmo_nodal"],
  );

  // ---- Event 3: acceptAnnouncement -------------------------------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${ann.id}/accept`, { version: v });
  await expect(
    "acceptAnnouncement → dept_reviewer + creator(cmo_nodal)",
    await rolesNotifiedSince(cursor),
    ["dept_reviewer", "cmo_nodal"],
  );

  // ---- Event 4: finalAcceptAnnouncement --------------------------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(deptReviewer, "POST", `/api/announcements/${ann.id}/final-accept`, { version: v });
  await expect(
    "finalAcceptAnnouncement → accepting dept_nodal + creator(cmo_nodal) + assigned cmo_reviewer",
    await rolesNotifiedSince(cursor),
    ["dept_nodal", "cmo_nodal", "cmo_reviewer"],
  );

  // ---- Event 5: startProgress (no notification expected) ---------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${ann.id}/start-progress`, { version: v });
  await expect("startProgress → (no notifications)", await rolesNotifiedSince(cursor), []);

  // ---- Pre-completion: mark all sub-components Completed ---------------
  // Use admin since announcement may have no sub-components for a fresh
  // matrix announcement. Skip if none exist; requestCompletion will then
  // run against an empty set (all-completed vacuously true).
  // ---- Event 6: requestCompletion --------------------------------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${ann.id}/request-completion`, { version: v });
  await expect(
    "requestCompletion → dept_reviewer",
    await rolesNotifiedSince(cursor),
    ["dept_reviewer"],
  );

  // ---- Event 7: reviewCompletion / approve -----------------------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(deptReviewer, "POST", `/api/announcements/${ann.id}/review-completion`, {
    version: v, action: "approve", comment: "matrix dept-completion approve",
  });
  await expect(
    "reviewCompletion/approve → cmo_reviewer",
    await rolesNotifiedSince(cursor),
    ["cmo_reviewer"],
  );

  // ---- Event 8: reviewCMOCompletion / approve --------------------------
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(ann.id)).version;
  await api(cmoReviewer, "POST", `/api/announcements/${ann.id}/review-cmo-completion`, {
    version: v, action: "approve", comment: "matrix cmo-completion approve",
  });
  await expect(
    "reviewCMOCompletion/approve → cmo_nodal + cmo_reviewer + dept_head + dept_nodal + dept_reviewer",
    await rolesNotifiedSince(cursor),
    ["cmo_nodal", "cmo_reviewer", "dept_head", "dept_nodal", "dept_reviewer"],
  );

  // ---- Revert paths on a second announcement ---------------------------
  const second = await api(cmoNodal, "POST", "/api/announcements", {
    house: "A",
    constituencyNumber: 100,
    title: `Matrix Revert ${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    description: "revert paths",
    department: "Agriculture & Farmers' Emp",
    occasion: "Audit",
    location: "Bhubaneswar",
    tags: ["Matrix"],
  });
  const revAnn = second.announcement;

  // Event 9: reviewAnnouncement / revert → creator (cmo_nodal)
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(cmoReviewer, "POST", `/api/announcements/${revAnn.id}/review`, {
    version: v, action: "revert", comment: "needs work",
  });
  await expect(
    "reviewAnnouncement/revert → creator(cmo_nodal)",
    await rolesNotifiedSince(cursor),
    ["cmo_nodal"],
  );

  // Event 10: updateAnnouncement (CMO revert path) → assigned cmo_reviewer
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(cmoNodal, "PATCH", `/api/announcements/${revAnn.id}`, {
    version: v,
    description: "updated post-revert",
  });
  await expect(
    "updateAnnouncement (post-CMO-revert) → cmo_reviewer",
    await rolesNotifiedSince(cursor),
    ["cmo_reviewer"],
  );

  // Drive revAnn through to in_progress for completion-revert exercise.
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(cmoReviewer, "POST", `/api/announcements/${revAnn.id}/review`, {
    version: v, action: "approve", comment: "approved on retry",
  });
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${revAnn.id}/accept`, { version: v });
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(deptReviewer, "POST", `/api/announcements/${revAnn.id}/final-accept`, { version: v });
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${revAnn.id}/start-progress`, { version: v });
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(deptNodal, "POST", `/api/announcements/${revAnn.id}/request-completion`, { version: v });

  // Event 11: reviewCompletion / revert → accepting dept_nodal
  cursor = await maxNotificationId();
  v = (await getAnnouncementVersion(revAnn.id)).version;
  await api(deptReviewer, "POST", `/api/announcements/${revAnn.id}/review-completion`, {
    version: v, action: "revert", comment: "completion not satisfactory",
  });
  await expect(
    "reviewCompletion/revert → accepting dept_nodal",
    await rolesNotifiedSince(cursor),
    ["dept_nodal"],
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
