import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, departmentsTable } from "@workspace/db";
import { asyncHandler } from "../lib/errors";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

// Minimal user directory used by every authenticated role for workflow
// routing — round-robin CMO Reviewer assignment, notification recipient
// lookup, sub-component owner display, accepting Dept Nodal lookup, etc.
// PII (email, mobile) is intentionally omitted; full user records are only
// available via /users (admin + dept_nodal).
router.get(
  "/directory",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        name: usersTable.name,
        role: usersTable.role,
        department: departmentsTable.name,
        status: usersTable.status,
      })
      .from(usersTable)
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .orderBy(usersTable.id);
    res.json({ users: rows });
  }),
);

export default router;
