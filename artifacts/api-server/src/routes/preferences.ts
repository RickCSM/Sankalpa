import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, type UserPreferences } from "@workspace/db";
import { asyncHandler } from "../lib/errors";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(requireAuth);

// Self-scoped UI preferences that follow the user across devices/browsers.
// All keys are optional; unset keys fall back to their default in the client.
const updatePreferencesSchema = z.object({
  notificationsVisible: z.boolean().optional(),
});

async function loadPreferences(userId: number): Promise<UserPreferences> {
  const rows = await db
    .select({ preferences: usersTable.preferences })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return rows[0]?.preferences ?? {};
}

router.get(
  "/me/preferences",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const preferences = await loadPreferences(actor.id);
    res.json({ preferences });
  }),
);

router.put(
  "/me/preferences",
  asyncHandler(async (req, res) => {
    const actor = req.session.user!;
    const patch = updatePreferencesSchema.parse(req.body);
    // Merge with any existing keys so a partial update never drops other
    // preferences. Only keys explicitly provided in the request are changed.
    const current = await loadPreferences(actor.id);
    const preferences: UserPreferences = { ...current, ...patch };
    await db
      .update(usersTable)
      .set({ preferences, updatedAt: new Date() })
      .where(eq(usersTable.id, actor.id));
    res.json({ preferences });
  }),
);

export default router;
