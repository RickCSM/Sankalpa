import puppeteer, { type Page, type Browser } from "puppeteer-core";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, "../screenshots");

// Use the Replit dev-domain proxy so that the frontend and API are
// same-origin (both served from the same host).  The proxy routes
// requests to the appropriate local port transparently.
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
if (!REPLIT_DEV_DOMAIN) {
  throw new Error("REPLIT_DEV_DOMAIN env var is not set");
}
const FRONTEND_URL = `https://${REPLIT_DEV_DOMAIN}`;

// ─── Chromium discovery ──────────────────────────────────────────────────────
function resolveChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const found = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null",
      { encoding: "utf8" }
    ).trim();
    if (found) return found;
  } catch {
    // fall through to Nix-store lookup
  }
  try {
    const nixPath = execSync(
      "find /nix/store -maxdepth 3 -name 'chromium' -type f 2>/dev/null | head -1",
      { encoding: "utf8" }
    ).trim();
    if (nixPath) return nixPath;
  } catch {
    // fall through to hard-coded fallback
  }
  // Last resort: known path from install step
  return "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
}

const CHROMIUM_PATH = resolveChromiumPath();
const VIEWPORT = { width: 1280, height: 720 };

if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function save(data: Buffer | string, name: string) {
  const p = resolve(SCREENSHOTS_DIR, name);
  writeFileSync(p, data);
  console.log(`  📸  ${name}`);
}

async function waitForAppReady(page: Page) {
  // Use string form so TypeScript does not try to type-check the browser context
  await page
    .waitForFunction("!document.body.innerText.includes('Loading')", {
      timeout: 10000,
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
}

/** Log in via the API endpoint (bypasses the client-side captcha).
 *  Returns the user's mustChangePassword flag so the caller can handle it. */
async function loginViaApi(
  page: Page,
  username: string,
  password: string
): Promise<{ ok: boolean; mustChangePassword?: boolean }> {
  const result = await page.evaluate(
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
      } catch (e) {
        return { ok: false, mustChangePassword: false, error: String(e) };
      }
    },
    username,
    password
  );
  return result;
}

async function changePasswordViaApi(
  page: Page,
  current: string,
  next: string
): Promise<boolean> {
  const ok = await page.evaluate(
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
  return ok;
}

async function logoutViaApi(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  });
}

/** Ensure the page is at the base URL so that relative fetch calls work.
 *  We navigate to /login (a public page) first. */
async function ensureBaseContext(page: Page) {
  const url = page.url();
  if (!url.startsWith(FRONTEND_URL)) {
    await page.goto(`${FRONTEND_URL}/login`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
  }
}

/** Login as the given user, trying the default and several common alt passwords.
 *  If mustChangePassword is set, rotates to the alt password.
 *  Returns the password that worked. */
async function ensureLoggedIn(
  page: Page,
  username: string,
  defaultPw: string
): Promise<string> {
  // Build a list of candidate passwords to try, in order.
  // Previous script runs may have rotated to "4"-suffix or "!"-suffix variants.
  const candidates = [
    defaultPw,
    defaultPw + "!",   // first alt: append "!"
    defaultPw + "1",   // second alt: append "1"
    defaultPw.replace(/@\d+$/, (m) => m + "4"), // e.g. @123 → @1234
    defaultPw.slice(0, -1) + "4", // replace last char with "4"
  ];

  await ensureBaseContext(page);

  let authed = { ok: false, mustChangePassword: false };
  let usedPw = defaultPw;

  for (const pw of candidates) {
    const result = await loginViaApi(page, username, pw);
    if (result.ok) {
      authed = { ok: true, mustChangePassword: result.mustChangePassword ?? false };
      usedPw = pw;
      break;
    }
  }

  if (!authed.ok) {
    throw new Error(
      `Login failed for ${username} — tried ${candidates.length} password variants`
    );
  }

  if (authed.mustChangePassword) {
    const altPw = defaultPw + "!";
    console.log(`   ⚠️  mustChangePassword for ${username} — rotating to alt password…`);
    const changed = await changePasswordViaApi(page, usedPw, altPw);
    if (!changed) throw new Error(`Password change failed for ${username}`);
    usedPw = altPw;
  }

  return usedPw;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function screenshotPage(
  page: Page,
  path: string,
  filename: string
) {
  await page.goto(`${FRONTEND_URL}${path}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await waitForAppReady(page);
  await save((await page.screenshot({ fullPage: false })) as Buffer, filename);
}

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
  });
}

async function main() {
  console.log(`\n🖥️   Launching headless browser (${CHROMIUM_PATH})…\n`);
  const browser = await launchBrowser();

  try {
    // ── 1. Login page (unauthenticated) ───────────────────────────────────
    console.log("📷  Capturing public pages…");
    const loginPage = await browser.newPage();
    await loginPage.setViewport(VIEWPORT);
    await loginPage.goto(`${FRONTEND_URL}/login`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await new Promise((r) => setTimeout(r, 1500));
    await save(
      (await loginPage.screenshot({ fullPage: false })) as Buffer,
      "login.png"
    );
    await loginPage.close();

    // ── 2. CMO Nodal session — Dashboard, Announcements, My Actions,
    //         Reports, UOI Notes ───────────────────────────────────────────
    console.log("\n📷  CMO Nodal session…");
    const cmoPage = await browser.newPage();
    await cmoPage.setViewport(VIEWPORT);

    // Navigate to the base URL first so API calls use the correct origin
    await cmoPage.goto(`${FRONTEND_URL}/login`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await ensureLoggedIn(cmoPage, "cmo_nodal", "Cmo@123");

    // Dashboard — cmo_nodal goes to '/' which renders the Dashboard component
    await screenshotPage(cmoPage, "/", "dashboard.png");

    // Announcements list
    await screenshotPage(cmoPage, "/announcements", "announcements.png");

    // Announcement detail — navigate to first row visible to this user
    {
      // Re-load the list to ensure we start fresh
      await cmoPage.goto(`${FRONTEND_URL}/announcements`, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await waitForAppReady(cmoPage);

      // Pass as a string so TypeScript does not attempt to type-check the
      // browser-executed DOM code (no dom lib in this Node.js tsconfig).
      const clicked = (await cmoPage.evaluate(`
        (() => {
          var row = document.querySelector("table tbody tr");
          if (row) { row.click(); return true; }
          var link = document.querySelector('a[href*="/announcements/"]');
          if (link) { link.click(); return true; }
          return false;
        })()
      `)) as boolean;

      if (clicked) {
        await cmoPage
          .waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 })
          .catch(() => {});
        await waitForAppReady(cmoPage);
        await save(
          (await cmoPage.screenshot({ fullPage: false })) as Buffer,
          "announcement-detail.png"
        );
      } else {
        console.warn("   ⚠️  No announcement row found; skipping detail screenshot");
      }
    }

    // My Actions
    await screenshotPage(cmoPage, "/my-actions", "my-actions.png");

    // Reports — Letter Count
    await screenshotPage(cmoPage, "/reports/letter-count", "reports.png");

    // UOI Notes
    await screenshotPage(cmoPage, "/uoi-notes", "uoi-notes.png");

    await cmoPage.close();

    // ── 3. Admin session — User Management, Activity Log ─────────────────
    console.log("\n📷  Admin session…");
    const adminPage = await browser.newPage();
    await adminPage.setViewport(VIEWPORT);

    await adminPage.goto(`${FRONTEND_URL}/login`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await ensureLoggedIn(adminPage, "admin", "Admin@123");

    // User Management — admin lands on /users automatically, but we navigate
    // explicitly to ensure the correct page is captured
    await screenshotPage(adminPage, "/users", "user-management.png");

    // Activity Log
    await screenshotPage(adminPage, "/activity-log", "activity-log.png");

    await adminPage.close();
  } finally {
    await browser.close();
  }

  const files = [
    "login.png",
    "dashboard.png",
    "announcements.png",
    "announcement-detail.png",
    "my-actions.png",
    "reports.png",
    "uoi-notes.png",
    "user-management.png",
    "activity-log.png",
  ];

  console.log(`\n✅  ${files.length} screenshots saved to: ${SCREENSHOTS_DIR}\n`);
}

main().catch((err) => {
  console.error("❌  capture-screenshots failed:", err);
  process.exit(1);
});
