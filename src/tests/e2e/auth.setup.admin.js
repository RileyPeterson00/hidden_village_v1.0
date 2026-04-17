// @ts-check
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Auth setup file for the Admin role — runs once before any test project
 * that depends on it.
 *
 * Signs in with the admin credentials from .env.e2e, then saves:
 *   1. playwright/.auth/admin.json          — localStorage + cookies (Playwright storageState)
 *   2. playwright/.auth/admin-firebase-session.json — Firebase auth keys from sessionStorage
 *
 * WHY TWO FILES:
 *   Firebase is initialised with browserSessionPersistence (init.js), so it stores
 *   the auth token in sessionStorage — not localStorage.  Playwright's storageState
 *   only captures localStorage and cookies, so the Firebase token is lost between
 *   setup and the actual tests.  We work around this by separately saving every
 *   "firebase:*" sessionStorage key to a JSON file, then injecting them back into
 *   sessionStorage via page.addInitScript() before each page.goto() call.
 *
 * If credentials are absent both files are written empty so dependent tests can
 * still be discovered and skip themselves internally.
 *
 * Required .env.e2e variables:
 *   PLAYWRIGHT_ADMIN_EMAIL
 *   PLAYWRIGHT_ADMIN_PASSWORD
 */

export const ADMIN_AUTH = path.join(process.cwd(), 'playwright/.auth/admin.json');
export const ADMIN_FIREBASE_SESSION = path.join(
  process.cwd(),
  'playwright/.auth/admin-firebase-session.json'
);

/** Ensure the directory exists before writing to it. */
function ensureDir(/** @type {string} */ filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

  if (!email || !password) {
    // Write empty state files so dependent projects can still be discovered.
    ensureDir(ADMIN_AUTH);
    fs.writeFileSync(ADMIN_AUTH, JSON.stringify({ cookies: [], origins: [] }));
    ensureDir(ADMIN_FIREBASE_SESSION);
    fs.writeFileSync(ADMIN_FIREBASE_SESSION, JSON.stringify({}));
    console.warn(
      '\n[auth.setup.admin] PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD not found in .env.e2e — writing empty auth state.\n' +
      '  Admin-path tests will skip themselves automatically.\n'
    );
    return;
  }

  await page.goto('/signin');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('input[type="submit"]');

  // Firebase auth redirects to "/" on success.
  await page.waitForURL((url) => !url.pathname.includes('/signin'), {
    timeout: 20_000,
  });

  // Wait for the PixiJS canvas to confirm the app has fully mounted.
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  // Persist cookies + localStorage.
  ensureDir(ADMIN_AUTH);
  await page.context().storageState({ path: ADMIN_AUTH });

  // Separately persist Firebase auth keys from sessionStorage.
  // Playwright's storageState does NOT capture sessionStorage, but Firebase
  // uses browserSessionPersistence which stores the auth token there.
  const firebaseSession = await page.evaluate(() => {
    /** @type {Record<string, string>} */
    const result = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('firebase:')) {
        result[key] = sessionStorage.getItem(key) ?? '';
      }
    }
    return result;
  });

  ensureDir(ADMIN_FIREBASE_SESSION);
  fs.writeFileSync(ADMIN_FIREBASE_SESSION, JSON.stringify(firebaseSession, null, 2));

  const tokenCount = Object.keys(firebaseSession).length;
  console.log(
    `[auth.setup.admin] Auth state saved to ${ADMIN_AUTH}`,
    `\n[auth.setup.admin] Firebase session (${tokenCount} key(s)) saved to ${ADMIN_FIREBASE_SESSION}`,
  );
});
