import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, departmentsTable } from "@workspace/db";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/errors";
import { getSessionUser, requireAuth, type SessionUser } from "../lib/auth";
import { writeAudit, markAudited, clientIp, clientUserAgent } from "../lib/audit";

const router: IRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        passwordHash: usersTable.passwordHash,
        name: usersTable.name,
        role: usersTable.role,
        email: usersTable.email,
        status: usersTable.status,
        profileImagePath: usersTable.profileImagePath,
        departmentName: departmentsTable.name,
      })
      .from(usersTable)
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .where(eq(usersTable.username, username))
      .limit(1);
    const user = rows[0];

    // Log failed-login attempts so the Activity Log can surface brute-force
    // patterns. NEVER include the attempted password. `actorId` is null for
    // unknown users; for disabled/wrong-password attempts we attach the
    // matched user id so an admin can see which account was targeted.
    const writeFailed = (reason: string, actorId: number | null, actorRole: string) =>
      writeAudit(db, {
        actorId,
        actorRole,
        method: "POST",
        route: "/api/auth/login",
        action: "auth.login_failed",
        targetTable: "auth",
        targetId: actorId,
        after: { username, reason },
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
      });

    if (!user) {
      await writeFailed("user_not_found", null, "anonymous");
      markAudited(res);
      throw new HttpError(401, "User not found");
    }
    if (user.status !== "Active") {
      await writeFailed("account_disabled", user.id, user.role);
      markAudited(res);
      throw new HttpError(403, "This account is disabled. Please contact the administrator.");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await writeFailed("wrong_password", user.id, user.role);
      markAudited(res);
      throw new HttpError(401, "Incorrect password");
    }
    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.departmentName,
      email: user.email,
      profileImagePath: user.profileImagePath,
    };
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.user = sessionUser;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    await writeAudit(db, {
      actorId: sessionUser.id,
      actorRole: sessionUser.role,
      method: "POST",
      route: "/api/auth/login",
      action: "auth.login",
      targetTable: "auth",
      after: { username: sessionUser.username },
      ip: clientIp(req),
      userAgent: clientUserAgent(req),
    });
    markAudited(res);
    res.json({ user: sessionUser });
  }),
);

router.post(
  "/auth/logout",
  asyncHandler(async (req, res) => {
    const actor = req.session?.user;
    if (!req.session) {
      res.status(204).end();
      return;
    }
    if (actor) {
      await writeAudit(db, {
        actorId: actor.id,
        actorRole: actor.role,
        method: "POST",
        route: "/api/auth/logout",
        action: "auth.logout",
        targetTable: "auth",
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
      });
    }
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie("sankalpa.sid", { path: "/" });
    markAudited(res);
    res.status(204).end();
  }),
);

router.get("/auth/me", (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user });
});

const changePwSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

router.post(
  "/auth/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const { currentPassword, newPassword } = changePwSchema.parse(req.body);
    if (newPassword === currentPassword) {
      throw new HttpError(400, "New password must differ from current password");
    }
    if (newPassword.toLowerCase() === actor.username.toLowerCase()) {
      throw new HttpError(400, "Password cannot equal your username");
    }
    const rows = await db
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, actor.id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new HttpError(401, "Not authenticated");
    const ok = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!ok) throw new HttpError(400, "Current password is incorrect");
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ passwordHash: newHash })
        .where(eq(usersTable.id, actor.id));
      await writeAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        method: "POST",
        route: "/api/auth/change-password",
        action: "auth.change_password",
        targetTable: "users",
        targetId: actor.id,
        after: {},
      });
    });
    req.session.user = actor;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    markAudited(res);
    res.status(204).end();
  }),
);

export default router;
