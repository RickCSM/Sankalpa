/**
 * capture-manual-media.ts
 * ------------------------------------------------------------------
 * Captures fresh, high-resolution screenshots and short screen-recording
 * clips of the live Sankalpa Odisha app, for use in the in-app interactive
 * User Manual.
 *
 * Output (served by the web artifact under /manual/...):
 *   artifacts/sankalpa-odisha/public/manual/shots/*.png
 *   artifacts/sankalpa-odisha/public/manual/clips/*.mp4
 *
 * Screenshots are captured at deviceScaleFactor 2 for crisp display.
 * Clips are recorded as webm via Chromium screencast, then transcoded to
 * mp4 (H.264) with ffmpeg for broad browser compatibility.
 *
 * Logs in through /api/auth/login (bypasses the client captcha) using the
 * demo credentials seeded in the database.
 */
import puppeteer, { type Page, type Browser } from "puppeteer-core";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(
  __dirname,
  "../../artifacts/sankalpa-odisha/public/manual"
);
const SHOTS_DIR = resolve(OUT_DIR, "shots");
const CLIPS_DIR = resolve(OUT_DIR, "clips");

const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
if (!REPLIT_DEV_DOMAIN) {
  throw new Error("REPLIT_DEV_DOMAIN env var is not set");
}
const FRONTEND_URL = `https://${REPLIT_DEV_DOMAIN}`;

// ─── Tooling discovery ───────────────────────────────────────────────────────
function resolveBin(...names: string[]): string | null {
  for (const n of names) {
    try {
      const found = execSync(`which ${n} 2>/dev/null`, {
        encoding: "utf8",
      }).trim();
      if (found) return found;
    } catch {
      /* try next */
    }
  }
  return null;
}

function resolveChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const found = resolveBin("chromium", "chromium-browser");
  if (found) return found;
  try {
    const nixPath = execSync(
      "find /nix/store -maxdepth 3 -name 'chromium' -type f 2>/dev/null | head -1",
      { encoding: "utf8" }
    ).trim();
    if (nixPath) return nixPath;
  } catch {
    /* fall through */
  }
  return "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
}

const CHROMIUM_PATH = resolveChromiumPath();
const FFMPEG_PATH = resolveBin("ffmpeg");
const VIEWPORT = { width: 1440, height: 900 };

for (const dir of [SHOTS_DIR, CLIPS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── Generic helpers ─────────────────────────────────────────────────────────
function saveBuffer(data: Buffer, dir: string, name: string) {
  writeFileSync(resolve(dir, name), data);
  console.log(`  📸  ${name}`);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForAppReady(page: Page) {
  await page
    .waitForFunction("!document.body.innerText.includes('Loading')", {
      timeout: 12000,
    })
    .catch(() => {});
  await sleep(1200);
}

/**
 * Client-side (SPA) navigation.
 *
 * A full `page.goto` of any *nested* protected route re-bootstraps the app and
 * its session check (`GET /api/auth/me`) returns 401 through the dev proxy for
 * deep links, bouncing the page to /login — only the root path survives. So
 * instead we navigate within the already-authenticated SPA: wouter v3 patches
 * `history.pushState` to emit a `pushState` event it subscribes to, re-rendering
 * the matched route WITHOUT a reload and WITHOUT firing `popstate` (which the
 * app's BackGuard would otherwise turn into a logout prompt).
 *
 * Requires the page to have first been bootstrapped via `bootstrapAuthedHome`
 * so `AuthContext` holds the hydrated user in memory.
 */
async function spaGoto(page: Page, path: string) {
  await page.evaluate((to: string) => {
    window.history.pushState(null, "", to);
  }, path);
}

/**
 * Guard against silent wrong-page captures: if a navigation unexpectedly landed
 * on the login screen (session lost / route bounced), warn loudly so a stale
 * login screenshot is never mistaken for real content.
 */
async function assertNotLogin(page: Page, label: string) {
  const onLogin = await page.evaluate(
    () =>
      location.pathname.endsWith("/login") ||
      !!document.querySelector('input[placeholder*="Captcha" i]')
  );
  if (onLogin) {
    console.warn(
      `   ⚠️  ${label} landed on the LOGIN page — capture is NOT real content!`
    );
  }
  return !onLogin;
}

/**
 * After logging in (which only sets the session cookie via the raw fetch),
 * do a single full load of the root path so `AuthContext` re-runs its session
 * check and hydrates the user in memory. From here, use `spaGoto` for every
 * other route. Admins are redirected to /users by the root guard — that's fine,
 * the session is still hydrated.
 */
async function bootstrapAuthedHome(page: Page) {
  await page.goto(`${FRONTEND_URL}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForAppReady(page);
}

// ─── Auth helpers (mirrors capture-screenshots.ts) ───────────────────────────
async function loginViaApi(
  page: Page,
  username: string,
  password: string
): Promise<{ ok: boolean; mustChangePassword?: boolean }> {
  return page.evaluate(
    async (un: string, pw: string) => {
      try {
        const resp = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: un, password: pw }),
        });
        const data = (await resp.json()) as Record<string, unknown>;
        return {
          ok: resp.ok,
          mustChangePassword: !!(
            data?.user as Record<string, unknown> | undefined
          )?.mustChangePassword,
        };
      } catch {
        return { ok: false, mustChangePassword: false };
      }
    },
    username,
    password
  );
}

async function changePasswordViaApi(
  page: Page,
  current: string,
  next: string
): Promise<boolean> {
  return page.evaluate(
    async (cur: string, nxt: string) => {
      const resp = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: cur, newPassword: nxt }),
      });
      return resp.ok;
    },
    current,
    next
  );
}

async function logoutViaApi(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  });
}

async function ensureBaseContext(page: Page) {
  if (!page.url().startsWith(FRONTEND_URL)) {
    await page.goto(`${FRONTEND_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }
}

async function ensureLoggedIn(
  page: Page,
  username: string,
  defaultPw: string
): Promise<string> {
  const candidates = [
    defaultPw,
    defaultPw + "!",
    defaultPw + "1",
    defaultPw.replace(/@\d+$/, (m) => m + "4"),
    defaultPw.slice(0, -1) + "4",
  ];
  await ensureBaseContext(page);

  let usedPw = defaultPw;
  let mustChange = false;
  let ok = false;
  for (const pw of candidates) {
    const result = await loginViaApi(page, username, pw);
    if (result.ok) {
      ok = true;
      usedPw = pw;
      mustChange = result.mustChangePassword ?? false;
      break;
    }
  }
  if (!ok) {
    throw new Error(
      `Login failed for ${username} — tried ${candidates.length} password variants`
    );
  }
  if (mustChange) {
    const altPw = defaultPw + "!";
    console.log(`   ⚠️  mustChangePassword for ${username} — rotating…`);
    const changed = await changePasswordViaApi(page, usedPw, altPw);
    if (!changed) throw new Error(`Password change failed for ${username}`);
    usedPw = altPw;
  }
  return usedPw;
}

// ─── Screenshot helpers ──────────────────────────────────────────────────────
async function shot(page: Page, path: string, filename: string) {
  try {
    await spaGoto(page, path);
    await waitForAppReady(page);
    await assertNotLogin(page, filename);
    saveBuffer(
      (await page.screenshot({ fullPage: false })) as Buffer,
      SHOTS_DIR,
      filename
    );
  } catch (e) {
    console.warn(`   ⚠️  Failed to capture ${filename} (${path}): ${String(e)}`);
  }
}

/** Fetch the first visible announcement id via the API (robust — avoids the
 *  SPA frame-detach that row-clicking causes). Returns null if none visible. */
async function firstAnnouncementId(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    try {
      const resp = await fetch("/api/announcements?page=1&pageSize=1", {
        credentials: "include",
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as Record<string, unknown>;
      const rows = (Array.isArray(data)
        ? data
        : (data.announcements ?? data.rows ?? data.data ?? data.items ?? [])) as Array<{
        id?: number;
      }>;
      return rows[0]?.id ?? null;
    } catch {
      return null;
    }
  });
}

/** Navigate to the first announcement's detail page by direct URL and shoot it. */
async function shotFirstAnnouncementDetail(page: Page, filename: string) {
  const id = await firstAnnouncementId(page);
  if (id == null) {
    console.warn(`   ⚠️  No announcement visible; skipping ${filename}`);
    return;
  }
  await spaGoto(page, `/announcements/${id}`);
  await waitForAppReady(page);
  await assertNotLogin(page, filename);
  saveBuffer(
    (await page.screenshot({ fullPage: false })) as Buffer,
    SHOTS_DIR,
    filename
  );
}

/**
 * Find the first announcement id whose status is in `statuses` (read-only — used
 * to tour the detail screen where a specific workflow action is performed,
 * without ever mutating any data). Returns null if none are visible.
 */
async function firstAnnouncementIdByStatus(
  page: Page,
  statuses: string[]
): Promise<number | null> {
  return page.evaluate(async (wanted: string[]) => {
    try {
      const resp = await fetch("/api/announcements?page=1&pageSize=100", {
        credentials: "include",
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as Record<string, unknown>;
      const rows = (Array.isArray(data)
        ? data
        : (data.announcements ?? data.rows ?? data.data ?? data.items ?? [])) as Array<{
        id?: number;
        status?: string;
      }>;
      const set = new Set(wanted);
      const match = rows.find((r) => r.status && set.has(r.status));
      return match?.id ?? rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }, statuses);
}

// ─── Clip helpers (frame-based) ──────────────────────────────────────────────
// Chromium's screencast emits no frames reliably in headless mode here, so we
// build clips deterministically: capture a sequence of screenshot "frames"
// while the page scrolls/interacts, then assemble them into an mp4 with ffmpeg.

const CLIP_FPS = 12;

/** A frame recorder that snapshots the page on demand into JPEG buffers. */
class FrameRecorder {
  private frames: Buffer[] = [];
  constructor(private page: Page) {}

  async grab() {
    this.frames.push(
      (await this.page.screenshot({ type: "jpeg", quality: 80 })) as Buffer
    );
  }

  /** Hold the current view for `count` frames (a pause). */
  async hold(count: number) {
    if (this.frames.length === 0) {
      await this.grab();
    }
    const last = this.frames[this.frames.length - 1]!;
    for (let i = 0; i < count; i++) this.frames.push(last);
  }

  /** Smoothly scroll top→bottom, grabbing a frame at each step. */
  async scrollThrough(steps = 36) {
    const maxY = (await this.page.evaluate(
      "Math.max(0, document.body.scrollHeight - window.innerHeight)"
    )) as number;
    await this.page.evaluate("window.scrollTo(0, 0)");
    await sleep(120);
    await this.grab();
    if (maxY <= 0) {
      await this.hold(steps);
      return;
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      await this.page.evaluate(`window.scrollTo(0, ${Math.round(eased * maxY)})`);
      await sleep(40);
      await this.grab();
    }
  }

  get count() {
    return this.frames.length;
  }

  /** Assemble the captured frames into <name>.mp4 via ffmpeg. */
  async assemble(name: string) {
    if (this.frames.length === 0) {
      console.warn(`   ⚠️  Clip "${name}" has no frames; skipping`);
      return;
    }
    if (!FFMPEG_PATH) {
      console.warn("   ⚠️  ffmpeg not found — cannot assemble clips");
      return;
    }
    const tmp = resolve(CLIPS_DIR, `__frames_${name}`);
    if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
    this.frames.forEach((buf, i) => {
      writeFileSync(
        resolve(tmp, `f_${String(i).padStart(4, "0")}.jpg`),
        buf
      );
    });
    const mp4 = resolve(CLIPS_DIR, `${name}.mp4`);
    try {
      execSync(
        `${FFMPEG_PATH} -y -framerate ${CLIP_FPS} -i "${tmp}/f_%04d.jpg" ` +
          `-movflags +faststart -pix_fmt yuv420p ` +
          `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -an "${mp4}" 2>/dev/null`,
        { stdio: "ignore" }
      );
      console.log(`  🎬  ${name}.mp4 (${this.frames.length} frames)`);
    } catch (e) {
      console.warn(`   ⚠️  ffmpeg assemble failed for ${name}: ${String(e)}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

/** Build a clip by running `action` against a fresh FrameRecorder. */
async function recordClip(
  page: Page,
  name: string,
  action: (rec: FrameRecorder, page: Page) => Promise<void>
) {
  try {
    const rec = new FrameRecorder(page);
    await action(rec, page);
    await rec.assemble(name);
  } catch (e) {
    console.warn(`   ⚠️  Clip "${name}" failed: ${String(e)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    defaultViewport: { ...VIEWPORT, deviceScaleFactor: 2 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--force-color-profile=srgb",
    ],
  });
}

async function main() {
  const MODE = (process.argv[2] ?? "all").toLowerCase();
  const wantShots = MODE === "shots" || MODE === "all";
  const wantClips = MODE === "clips" || MODE === "all";
  const wantFlows = MODE === "flows" || MODE === "all";

  console.log(`\n🖥️   Launching headless browser…  (mode: ${MODE})`);
  console.log(`     chromium: ${CHROMIUM_PATH}`);
  console.log(`     ffmpeg:   ${FFMPEG_PATH ?? "NOT FOUND"}`);
  console.log(`     output:   ${OUT_DIR}\n`);

  const browser = await launchBrowser();

  try {
    // ── Public: login page ────────────────────────────────────────────────
    if (wantShots) {
      console.log("📷  Public pages…");
      const p = await browser.newPage();
      await p.goto(`${FRONTEND_URL}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await sleep(1500);
      saveBuffer(
        (await p.screenshot({ fullPage: false })) as Buffer,
        SHOTS_DIR,
        "login.png"
      );
      await p.close();
    }

    // ── CMO Nodal: dashboard, announcements, reports, UOI, my-actions ─────
    if (wantShots || wantClips) {
      console.log("\n📷  CMO Nodal session…");
      const p = await browser.newPage();
      await p.goto(`${FRONTEND_URL}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await ensureLoggedIn(p, "cmo_nodal", "Cmo@123");
      await bootstrapAuthedHome(p);

      if (wantShots) {
        await shot(p, "/", "dashboard.png");
        await shot(p, "/announcements", "announcements.png");
        await shotFirstAnnouncementDetail(p, "announcement-detail.png");
        await shot(p, "/announcements/add", "add-announcement.png");
        await shot(p, "/my-actions", "my-actions.png");
        await shot(p, "/reports/letter-count", "report-letter-count.png");
        await shot(p, "/reports/aging-analysis", "report-aging.png");
        await shot(p, "/reports/department-wise", "report-department-wise.png");
        await shot(p, "/uoi-notes", "uoi-notes.png");
      }

      // Clips (read-only navigation — no DB mutations). Use scale 1 for
      // lighter frames; these run after all screenshots are captured.
      if (wantClips) {
      console.log("\n🎬  CMO Nodal clips…");
      await p.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });

      await recordClip(p, "tour-dashboard", async (rec, pg) => {
        await spaGoto(pg, "/");
        await waitForAppReady(pg);
        await rec.hold(8);
        await rec.scrollThrough(40);
        await rec.hold(8);
      });

      await recordClip(p, "tour-announcements", async (rec, pg) => {
        await spaGoto(pg, "/announcements");
        await waitForAppReady(pg);
        await rec.hold(8);
        await rec.scrollThrough(24);
        await pg.evaluate(`
          (() => {
            window.scrollTo(0, 0);
            var row = document.querySelector("table tbody tr");
            if (row) row.click();
          })()
        `);
        await pg
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12000 })
          .catch(() => {});
        await waitForAppReady(pg);
        await rec.hold(10);
        await rec.scrollThrough(36);
        await rec.hold(8);
      });

      await recordClip(p, "tour-create", async (rec, pg) => {
        await spaGoto(pg, "/announcements/add");
        await waitForAppReady(pg);
        await rec.hold(8);
        await rec.scrollThrough(40);
        await rec.hold(8);
      });
      }

      await p.close();
    }

    // ── Admin: users, user-tagging, masters, activity log ────────────────
    if (wantShots || wantClips) {
      console.log("\n📷  Admin session…");
      const p = await browser.newPage();
      await p.goto(`${FRONTEND_URL}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await ensureLoggedIn(p, "admin", "Admin@123");
      await bootstrapAuthedHome(p);

      if (wantShots) {
        await shot(p, "/users", "user-management.png");
        await shot(p, "/user-tagging", "user-tagging.png");
        await shot(p, "/masters/districts", "masters-districts.png");
        await shot(p, "/masters/departments", "masters-departments.png");
        await shot(p, "/activity-log", "activity-log.png");
      }

      if (wantClips) {
        console.log("\n🎬  Admin clips…");
        await p.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
        await recordClip(p, "tour-users", async (rec, pg) => {
          await spaGoto(pg, "/users");
          await waitForAppReady(pg);
          await rec.hold(8);
          await rec.scrollThrough(40);
          await rec.hold(8);
        });
      }

      await logoutViaApi(p);
      await p.close();
    }

    // ── Dept Nodal: dashboard + announcement detail (dept actions) ───────
    if (wantShots) {
      console.log("\n📷  Dept Nodal session…");
      const p = await browser.newPage();
      await p.goto(`${FRONTEND_URL}/login`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      try {
        await ensureLoggedIn(p, "dept_nodal", "Dept@123");
        await bootstrapAuthedHome(p);
        await shot(p, "/", "dept-dashboard.png");
        await shotFirstAnnouncementDetail(p, "dept-announcement-detail.png");
      } catch (e) {
        console.warn(`   ⚠️  Dept Nodal session skipped: ${String(e)}`);
      }
      await p.close();
    }

    // ── Flow clips: short looping tours of the REAL screen where each core
    //    workflow action happens. All read-only — we sign in as the role that
    //    performs the action and tour the relevant detail page; nothing is
    //    mutated. Output: clips/flow-*.mp4 + clips/login.mp4 ─────────────────
    if (wantFlows) {
      // login (public)
      console.log("\n🎬  Flow clip: login…");
      {
        const p = await browser.newPage();
        await p.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
        await p.goto(`${FRONTEND_URL}/login`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await sleep(1500);
        await recordClip(p, "login", async (rec) => {
          await rec.hold(14);
          await rec.scrollThrough(16);
          await rec.hold(10);
        });
        await p.close();
      }

      // Role-specific detail tours, each on the screen where the action lives.
      const flows: Array<{
        name: string;
        username: string;
        password: string;
        statuses: string[];
        label: string;
      }> = [
        { name: "flow-approve", username: "cmo_reviewer", password: "Cmo@123", statuses: ["pending_cmo_review"], label: "CMO approve / publish" },
        { name: "flow-accept", username: "dept_nodal", password: "Dept@123", statuses: ["published", "pending_dept_acceptance"], label: "Department accept" },
        { name: "flow-execute", username: "dept_nodal", password: "Dept@123", statuses: ["in_progress", "accepted"], label: "Execute sub-components" },
        { name: "flow-closure", username: "dept_nodal", password: "Dept@123", statuses: ["pending_completion_review", "pending_cmo_completion_review", "in_progress"], label: "Request & approve closure" },
      ];

      for (const f of flows) {
        console.log(`\n🎬  Flow clip: ${f.label}…`);
        const p = await browser.newPage();
        try {
          await p.goto(`${FRONTEND_URL}/login`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await ensureLoggedIn(p, f.username, f.password);
          await bootstrapAuthedHome(p);
          await p.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
          const id = await firstAnnouncementIdByStatus(p, f.statuses);
          if (id == null) {
            console.warn(`   ⚠️  No announcement found for ${f.name}; skipping`);
          } else {
            await recordClip(p, f.name, async (rec, pg) => {
              await spaGoto(pg, `/announcements/${id}`);
              await waitForAppReady(pg);
              if (!(await assertNotLogin(pg, f.name))) return;
              await rec.hold(10);
              await rec.scrollThrough(40);
              await rec.hold(8);
            });
          }
          await logoutViaApi(p);
        } catch (e) {
          console.warn(`   ⚠️  Flow clip ${f.name} skipped: ${String(e)}`);
        }
        await p.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n✅  Manual media captured to: ${OUT_DIR}\n`);
}

main().catch((err) => {
  console.error("❌  capture-manual-media failed:", err);
  process.exit(1);
});
