import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  usersTable,
  departmentsTable,
  auditLogTable,
  subComponentsTable,
  announcementsTable,
  userRoles,
  type UserRole,
} from "@workspace/db";
import { asyncHandler, HttpError } from "../lib/errors";
import { requireAuth, type SessionUser } from "../lib/auth";
import { writeAudit, markAudited, auditCtx } from "../lib/audit";
import { loadForUpdate, addComment, notify } from "../lib/workflow";
import crypto from "node:crypto";

const router: IRouter = Router();

const roleEnum = z.enum(userRoles);
const statusEnum = z.enum(["Active", "Inactive"]);

const baseUserShape = {
  username: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(200),
  role: roleEnum,
  department: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(200),
  mobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: statusEnum.optional(),
};

const createUserSchema = z.object({
  ...baseUserShape,
  password: z.string().min(6).max(200),
});

const updateUserSchema = z.object({
  ...baseUserShape,
  username: baseUserShape.username.optional(),
  name: baseUserShape.name.optional(),
  role: baseUserShape.role.optional(),
  email: baseUserShape.email.optional(),
});

const resetPasswordSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate") }),
  z.object({ mode: z.literal("custom"), password: z.string().min(8).max(200) }),
]);

const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i]! % TEMP_PASSWORD_ALPHABET.length];
  }
  // Guarantee at least one letter and one digit so the result satisfies the
  // same complexity rule we enforce on admin-supplied custom passwords.
  if (!/[A-Za-z]/.test(out)) out = "A" + out.slice(1);
  if (!/\d/.test(out)) out = out.slice(0, -1) + "7";
  return out;
}

function validateCustomPassword(password: string, username: string): void {
  if (password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Password must contain at least one letter and one digit");
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    throw new HttpError(400, "Password cannot equal the username");
  }
}

const DEPT_NODAL_ALLOWED_ROLES: UserRole[] = ["dept_reviewer", "dept_user", "dept_viewer"];

interface LastPasswordChange {
  at: string;
  action: string;
  // Nullable since the audit_log.actor_id column is now nullable (anonymous
  // events such as failed logins). Password-change actions always have an
  // actor in practice, but the column type forces us to admit null here.
  actorId: number | null;
  actorName: string | null;
  actorRole: string;
}

interface PublicUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  department: string | null;
  email: string;
  mobile: string | null;
  status: "Active" | "Inactive";
  lastPasswordChange: LastPasswordChange | null;
}

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  departmentId: number | null;
  departmentName: string | null;
  email: string;
  mobile: string | null;
  status: "Active" | "Inactive";
}

function toPublic(
  u: UserRow,
  includePII = true,
  lastPasswordChange: LastPasswordChange | null = null,
): PublicUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    department: u.departmentName,
    // PII (email/mobile) is only exposed to user-administering roles.
    email: includePII ? u.email : "",
    mobile: includePII ? u.mobile : null,
    status: u.status,
    lastPasswordChange,
  };
}

const PASSWORD_CHANGE_ACTIONS = [
  "auth.admin_reset_password",
  "auth.change_password",
];

/**
 * Look up the most recent password-change audit row for each user id and
 * return a map keyed by target user id. Uses Postgres DISTINCT ON for a
 * single-pass index-friendly query on (target_table, target_id).
 */
async function fetchLastPasswordChanges(
  userIds: number[],
): Promise<Map<number, LastPasswordChange>> {
  const result = new Map<number, LastPasswordChange>();
  if (userIds.length === 0) return result;
  const rows = await db
    .selectDistinctOn([auditLogTable.targetId], {
      targetId: auditLogTable.targetId,
      at: auditLogTable.createdAt,
      action: auditLogTable.action,
      actorId: auditLogTable.actorId,
      actorRole: auditLogTable.actorRole,
      actorName: usersTable.name,
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(auditLogTable.actorId, usersTable.id))
    .where(
      and(
        eq(auditLogTable.targetTable, "users"),
        inArray(auditLogTable.targetId, userIds),
        inArray(auditLogTable.action, PASSWORD_CHANGE_ACTIONS),
      ),
    )
    .orderBy(auditLogTable.targetId, sql`${auditLogTable.id} DESC`);
  for (const r of rows) {
    if (r.targetId == null) continue;
    result.set(r.targetId, {
      at: r.at.toISOString(),
      action: r.action,
      actorId: r.actorId,
      actorName: r.actorName ?? null,
      actorRole: r.actorRole,
    });
  }
  return result;
}

function selectUserWithDept() {
  return db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      name: usersTable.name,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
      email: usersTable.email,
      mobile: usersTable.mobile,
      status: usersTable.status,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));
}

async function resolveDepartmentId(name: string | null): Promise<number | null> {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, trimmed))
    .limit(1);
  if (!rows[0]) {
    throw new HttpError(400, `Unknown department: ${trimmed}`);
  }
  return rows[0].id;
}

async function ensureDeptNodalScope(
  actor: SessionUser,
  payload: { role?: UserRole; department?: string | null },
): Promise<{ role: UserRole; departmentId: number }> {
  if (!actor.department) {
    throw new HttpError(403, "Department Nodal must be assigned to a department");
  }
  const role = payload.role;
  if (!role || !DEPT_NODAL_ALLOWED_ROLES.includes(role)) {
    throw new HttpError(
      403,
      "Department Nodal can only manage Department Reviewers and Users",
    );
  }
  const id = await resolveDepartmentId(actor.department);
  if (id === null) throw new HttpError(403, "Actor department is unknown");
  return { role, departmentId: id };
}

router.use(requireAuth);

// Only Admin and Department Nodal may interact with /api/users at all. Other
// authenticated roles get a 403 here and use /api/directory for the minimal
// workflow-routing information they need (id/name/role/department).
function requireUserAdmin(req: import("express").Request): void {
  const actor = req.session.user!;
  if (actor.role !== "admin" && actor.role !== "dept_nodal") {
    throw new HttpError(403, "Forbidden");
  }
}

// Department roles that may own (be assigned) a sub-component. Mirrors the
// eligibility rule enforced in PATCH /sub-components/:id so that reassignment
// targets offered here cannot drift from what assignment actually accepts.
const DEPT_EXECUTOR_ROLES: UserRole[] = [
  "dept_head",
  "dept_nodal",
  "dept_reviewer",
  "dept_user",
];

/**
 * Assert the actor may administer the given target user. Mirrors the scoping
 * used by PATCH /users/:id: admin manages anyone; dept_nodal manages only
 * dept_reviewer/dept_user/dept_viewer inside their own department. Throws 403
 * otherwise. (Self-management is rejected by the calling routes separately.)
 */
function assertCanManageTarget(actor: SessionUser, target: UserRow): void {
  if (actor.role === "admin") return;
  if (actor.role === "dept_nodal") {
    if (!actor.department || target.departmentName !== actor.department) {
      throw new HttpError(403, "Cannot manage users outside your department");
    }
    if (!DEPT_NODAL_ALLOWED_ROLES.includes(target.role)) {
      throw new HttpError(403, "Cannot manage this user");
    }
    return;
  }
  throw new HttpError(403, "Forbidden");
}

/** Count sub-components assigned to a user that are not yet Completed. */
async function countPendingActivities(userId: number): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(subComponentsTable)
    .where(
      and(
        eq(subComponentsTable.assignedTo, userId),
        sql`${subComponentsTable.status} <> 'Completed'`,
      ),
    );
  return rows[0]?.c ?? 0;
}

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    requireUserAdmin(req);
    const actor = req.session.user!;
    const rows = (await selectUserWithDept().orderBy(usersTable.id)) as UserRow[];
    let visible = rows;
    if (actor.role === "dept_nodal") {
      // dept_nodal manages only dept_reviewer + dept_user inside their own
      // department; dept_head and other dept_nodals are out of scope.
      visible = rows.filter(
        (u) =>
          u.departmentName === actor.department &&
          DEPT_NODAL_ALLOWED_ROLES.includes(u.role),
      );
    }
    // Source-of-truth for "last password change" is audit_log; we only ever
    // load it for users the requester is already authorized to see, so this
    // does not leak cross-department history.
    const lastChanges = await fetchLastPasswordChanges(visible.map((u) => u.id));
    res.json({
      users: visible.map((u) => toPublic(u, true, lastChanges.get(u.id) ?? null)),
    });
  }),
);

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    requireUserAdmin(req);
    const actor = req.session.user!;
    const data = createUserSchema.parse(req.body);

    let role: UserRole = data.role;
    let departmentId: number | null;

    if (actor.role === "dept_nodal") {
      const scoped = await ensureDeptNodalScope(actor, {
        role,
        department: data.department,
      });
      role = scoped.role;
      departmentId = scoped.departmentId;
    } else {
      // dept_viewer must always be assigned to a department (admin-created only).
      // ocac_viewer mirrors chief_minister (cross-department) and needs none.
      if (role === "dept_viewer" && !data.department) {
        throw new HttpError(400, "Viewer roles must be assigned to a department");
      }
      departmentId = await resolveDepartmentId(data.department ?? null);
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, data.username))
      .limit(1);
    if (existing[0]) {
      throw new HttpError(409, "Username already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const inserted = await db
      .insert(usersTable)
      .values({
        username: data.username,
        passwordHash,
        name: data.name,
        role,
        departmentId,
        email: data.email,
        mobile: data.mobile ?? null,
        status: data.status ?? "Active",
      })
      .returning({ id: usersTable.id });
    const newId = inserted[0]!.id;
    const fresh = (await selectUserWithDept().where(eq(usersTable.id, newId)).limit(1)) as UserRow[];
    // Newly created user has no audit-logged password change yet; null is correct.
    res.status(201).json({ user: toPublic(fresh[0]!, true, null) });
  }),
);

router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    requireUserAdmin(req);
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "Invalid user id");
    }
    const targetRows = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const target = targetRows[0];
    if (!target) throw new HttpError(404, "User not found");

    if (actor.id === id) {
      throw new HttpError(403, "Cannot modify your own account here");
    }

    const data = updateUserSchema.parse(req.body);

    // Block deactivation while the user still holds pending (non-Completed)
    // sub-components. The client offers a reassignment flow first; this guard
    // is the server-side safety net that prevents tasks from being orphaned by
    // a deactivate-then-delete sequence.
    if (data.status === "Inactive" && target.status !== "Inactive") {
      const pending = await countPendingActivities(id);
      if (pending > 0) {
        throw new HttpError(
          409,
          `Cannot deactivate ${target.name}: ${pending} pending assigned ${pending === 1 ? "activity" : "activities"} must be reassigned first.`,
          { code: "PENDING_ACTIVITIES", pending },
        );
      }
    }

    let role: UserRole = data.role ?? target.role;
    let departmentId: number | null =
      data.department === undefined
        ? target.departmentId
        : await resolveDepartmentId(data.department);

    if (actor.role === "dept_nodal") {
      if (target.departmentName !== actor.department) {
        throw new HttpError(403, "Cannot modify users outside your department");
      }
      if (!DEPT_NODAL_ALLOWED_ROLES.includes(target.role)) {
        throw new HttpError(403, "Cannot modify this user");
      }
      const scoped = await ensureDeptNodalScope(actor, {
        role,
        department: actor.department,
      });
      role = scoped.role;
      departmentId = scoped.departmentId;
    } else {
      // Admin updating a user to dept_viewer must supply a department.
      // ocac_viewer mirrors chief_minister (cross-department) and needs none.
      if (role === "dept_viewer" && departmentId === null) {
        throw new HttpError(400, "Viewer roles must be assigned to a department");
      }
    }

    if (data.username && data.username !== target.username) {
      const dupe = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.username, data.username)))
        .limit(1);
      if (dupe[0] && dupe[0].id !== id) {
        throw new HttpError(409, "Username already exists");
      }
    }

    const update: Partial<typeof usersTable.$inferInsert> = {
      role,
      departmentId,
      updatedAt: new Date(),
    };
    if (data.username) update.username = data.username;
    if (data.name) update.name = data.name;
    if (data.email) update.email = data.email;
    if (data.mobile !== undefined) update.mobile = data.mobile ?? null;
    if (data.status) update.status = data.status;

    await db.update(usersTable).set(update).where(eq(usersTable.id, id));
    const fresh = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const lastChanges = await fetchLastPasswordChanges([id]);
    res.json({ user: toPublic(fresh[0]!, true, lastChanges.get(id) ?? null) });
  }),
);

// Returns the pending (non-Completed) sub-components a user still owns plus the
// active department-executor users they could be reassigned to. Drives the
// reassignment dialog the client shows before deactivation/deletion.
router.get(
  "/users/:id/workload",
  asyncHandler(async (req, res) => {
    requireUserAdmin(req);
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "Invalid user id");
    }
    const targetRows = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const target = targetRows[0];
    if (!target) throw new HttpError(404, "User not found");
    assertCanManageTarget(actor, target);

    const pendingActivities = await db
      .select({
        subComponentId: subComponentsTable.id,
        title: subComponentsTable.title,
        status: subComponentsTable.status,
        announcementId: subComponentsTable.announcementId,
        announcementTitle: announcementsTable.title,
        announcementUniqueId: announcementsTable.uniqueId,
        departmentId: announcementsTable.departmentId,
      })
      .from(subComponentsTable)
      .innerJoin(
        announcementsTable,
        eq(subComponentsTable.announcementId, announcementsTable.id),
      )
      .where(
        and(
          eq(subComponentsTable.assignedTo, id),
          sql`${subComponentsTable.status} <> 'Completed'`,
        ),
      )
      .orderBy(subComponentsTable.announcementId, subComponentsTable.id);

    // Eligibility follows each activity's announcement department, NOT the
    // target's current department (a user may have moved departments while
    // keeping older assignments). Candidates are active dept-executor-role
    // users in every department that the pending activities belong to; the
    // client filters per activity by departmentId and the reassign endpoint
    // re-validates each pick against the specific announcement.
    const deptIds = Array.from(
      new Set(
        pendingActivities
          .map((a) => a.departmentId)
          .filter((d): d is number => d !== null),
      ),
    );
    let eligibleAssignees: { id: number; name: string; role: UserRole; departmentId: number | null }[] = [];
    if (deptIds.length > 0) {
      eligibleAssignees = await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          role: usersTable.role,
          departmentId: usersTable.departmentId,
        })
        .from(usersTable)
        .where(
          and(
            inArray(usersTable.departmentId, deptIds),
            inArray(usersTable.role, DEPT_EXECUTOR_ROLES),
            eq(usersTable.status, "Active"),
            sql`${usersTable.id} <> ${id}`,
          ),
        )
        .orderBy(usersTable.name);
    }

    res.json({ pendingActivities, eligibleAssignees });
  }),
);

const reassignActivitiesSchema = z.object({
  assignments: z
    .array(
      z.object({
        subComponentId: z.number().int().positive(),
        newAssignedTo: z.number().int().positive(),
      }),
    )
    .min(1),
});

// Bulk-reassign a user's pending sub-components to other (possibly multiple)
// department users before the account is deactivated or deleted. Each item is
// validated and authorized independently; the whole request is transactional,
// so a single bad assignment rolls everything back.
router.post(
  "/users/:id/reassign-activities",
  asyncHandler(async (req, res) => {
    requireUserAdmin(req);
    const actor = req.session.user!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "Invalid user id");
    }
    if (actor.id === id) {
      throw new HttpError(403, "Cannot reassign your own activities here");
    }
    const targetRows = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const target = targetRows[0];
    if (!target) throw new HttpError(404, "User not found");
    assertCanManageTarget(actor, target);

    const data = reassignActivitiesSchema.parse(req.body);

    const seen = new Set<number>();
    for (const a of data.assignments) {
      if (seen.has(a.subComponentId)) {
        throw new HttpError(400, "The same sub-component appears more than once in the request");
      }
      seen.add(a.subComponentId);
      if (a.newAssignedTo === id) {
        throw new HttpError(400, "Cannot reassign an activity back to the user being removed");
      }
    }

    await db.transaction(async (tx) => {
      const candidateCache = new Map<
        number,
        { departmentId: number | null; role: UserRole; status: "Active" | "Inactive"; name: string }
      >();
      const loadCandidate = async (uid: number) => {
        const cached = candidateCache.get(uid);
        if (cached) return cached;
        const rows = await tx
          .select({
            departmentId: usersTable.departmentId,
            role: usersTable.role,
            status: usersTable.status,
            name: usersTable.name,
          })
          .from(usersTable)
          .where(eq(usersTable.id, uid))
          .limit(1);
        if (!rows[0]) throw new HttpError(400, "Reassignment target not found");
        candidateCache.set(uid, rows[0]);
        return rows[0];
      };

      for (const a of data.assignments) {
        const scRows = await tx
          .select()
          .from(subComponentsTable)
          .where(eq(subComponentsTable.id, a.subComponentId))
          .for("update");
        const sc = scRows[0];
        if (!sc) throw new HttpError(404, `Sub-component ${a.subComponentId} not found`);
        if (sc.assignedTo !== id) {
          throw new HttpError(
            409,
            `Sub-component "${sc.title}" is no longer assigned to ${target.name} — refresh and try again`,
          );
        }
        if (sc.status === "Completed") {
          throw new HttpError(
            409,
            `Sub-component "${sc.title}" is already completed and does not need reassignment`,
          );
        }
        const parent = await loadForUpdate(tx, sc.announcementId);

        // Authorization mirrors PATCH /sub-components/:id: admin, the CMO
        // creator while still pending acceptance, or the accepting Dept Nodal.
        const isCreatorRetagging =
          parent.createdBy === actor.id &&
          parent.workflowStatus === "pending_dept_acceptance";
        const isDeptNodalOwner = parent.acceptedByDeptNodalId === actor.id;
        if (!(actor.role === "admin" || isCreatorRetagging || isDeptNodalOwner)) {
          throw new HttpError(403, `You are not allowed to reassign "${sc.title}"`);
        }

        const candidate = await loadCandidate(a.newAssignedTo);
        if (candidate.departmentId !== parent.departmentId) {
          throw new HttpError(
            400,
            `New assignee for "${sc.title}" must belong to the same department as the announcement`,
          );
        }
        if (!DEPT_EXECUTOR_ROLES.includes(candidate.role)) {
          throw new HttpError(400, `New assignee for "${sc.title}" must be a department user`);
        }
        if (candidate.status !== "Active") {
          throw new HttpError(400, `New assignee for "${sc.title}" must be an active user`);
        }

        await tx
          .update(subComponentsTable)
          .set({ assignedTo: a.newAssignedTo, updatedAt: new Date() })
          .where(eq(subComponentsTable.id, sc.id));
        await addComment(
          tx,
          sc.announcementId,
          actor.id,
          "Sub-component Reassigned",
          `Sub-component "${sc.title}" reassigned from ${target.name} to ${candidate.name}.`,
        );
        await notify(
          tx,
          [a.newAssignedTo],
          `You have been assigned sub-component "${sc.title}" of "${parent.title}".`,
          "info",
          `/announcements/${sc.announcementId}`,
        );
        await writeAudit(
          tx,
          auditCtx(req, "subcomponent.reassign", "subcomponents", sc.id, {
            before: { assignedTo: sc.assignedTo },
            after: { assignedTo: a.newAssignedTo },
          }),
        );
      }
    });

    markAudited(res);
    res.status(204).end();
  }),
);

router.post(
  "/users/:id/reset-password",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    // Admin can reset anyone's password. Department Nodal can reset only
    // dept_reviewer and dept_user accounts inside their own department; all
    // other roles are forbidden. Self-reset always uses /auth/change-password.
    if (actor.role !== "admin" && actor.role !== "dept_nodal") {
      throw new HttpError(403, "Forbidden");
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "Invalid user id");
    }
    if (actor.id === id) {
      // Admins must use POST /api/auth/change-password for their own account
      // so they always know their working password (no temp-password bounce).
      throw new HttpError(403, "Use Change Password to update your own account");
    }
    const targetRows = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const target = targetRows[0];
    if (!target) throw new HttpError(404, "User not found");

    if (actor.role === "dept_nodal") {
      if (!actor.department || target.departmentName !== actor.department) {
        throw new HttpError(403, "Cannot reset password for users outside your department");
      }
      if (!DEPT_NODAL_ALLOWED_ROLES.includes(target.role)) {
        throw new HttpError(403, "Department Nodal can only reset Department Reviewer and User passwords");
      }
    }

    const body = resetPasswordSchema.parse(req.body);
    const newPassword =
      body.mode === "generate" ? generateTempPassword(12) : body.password;
    if (body.mode === "custom") {
      validateCustomPassword(newPassword, target.username);
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, id));
      await writeAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        method: "POST",
        route: `/api/users/${id}/reset-password`,
        action: "auth.admin_reset_password",
        targetTable: "users",
        targetId: id,
        after: { mode: body.mode },
      });
    });

    markAudited(res);
    res.json({ password: newPassword });
  }),
);

router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    // Hard delete is admin-only; Department Nodal must deactivate via PATCH
    // status=Inactive to preserve referential history.
    if (actor.role !== "admin") {
      throw new HttpError(403, "Forbidden");
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, "Invalid user id");
    }
    if (actor.id === id) {
      throw new HttpError(403, "Cannot delete your own account");
    }
    const targetRows = (await selectUserWithDept().where(eq(usersTable.id, id)).limit(1)) as UserRow[];
    const target = targetRows[0];
    if (!target) throw new HttpError(404, "User not found");

    // Pending sub-components must be reassigned first, otherwise the
    // assigned_to FK (ON DELETE SET NULL) would silently orphan live tasks.
    const pending = await countPendingActivities(id);
    if (pending > 0) {
      throw new HttpError(
        409,
        `Cannot delete ${target.name}: ${pending} pending assigned ${pending === 1 ? "activity" : "activities"} must be reassigned first.`,
        { code: "PENDING_ACTIVITIES", pending },
      );
    }

    // announcements.created_by is ON DELETE RESTRICT, so deleting an author
    // would fail at the DB level with an opaque error. Block it cleanly and
    // point the admin at deactivation, which preserves authored history.
    const authoredRows = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementsTable)
      .where(eq(announcementsTable.createdBy, id));
    const authored = authoredRows[0]?.c ?? 0;
    if (authored > 0) {
      throw new HttpError(
        409,
        `Cannot delete ${target.name}: this user created ${authored} announcement${authored === 1 ? "" : "s"}. Deactivate the account instead to preserve history.`,
        { code: "AUTHORED_ANNOUNCEMENTS", authored },
      );
    }

    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).end();
  }),
);

export default router;
