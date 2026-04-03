// @ts-check
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Auth setup file — runs once before any test project that depends on it.
 *
 * Signs in with the student credentials from .env.e2e, then saves:
 *   1. playwright/.auth/student.json  — localStorage + cookies (Playwright storageState)
 *   2. playwright/.auth/firebase-session.json — Firebase auth keys from sessionStorage
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
 */

export const STUDENT_AUTH = path.join(process.cwd(), 'playwright/.auth/student.json');
export const FIREBASE_SESSION = path.join(process.cwd(), 'playwright/.auth/firebase-session.json');

/** Ensure the directory exists before writing to it. */
function ensureDir(/** @type {string} */ filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

setup('authenticate as student', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

  if (!email || !password) {
    // Write empty state files so dependent projects can still be discovered.
    ensureDir(STUDENT_AUTH);
    fs.writeFileSync(STUDENT_AUTH, JSON.stringify({ cookies: [], origins: [] }));
    ensureDir(FIREBASE_SESSION);
    fs.writeFileSync(FIREBASE_SESSION, JSON.stringify({}));
    console.warn(
      '\n[auth.setup] Credentials not found in .env.e2e — writing empty auth state.\n' +
      '  Game-flow tests will skip themselves automatically.\n'
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
  ensureDir(STUDENT_AUTH);
  await page.context().storageState({ path: STUDENT_AUTH });

  // Separately persist Firebase auth keys from sessionStorage.
  // Playwright's storageState does NOT capture sessionStorage, but Firebase
  // uses browserSessionPersistence which stores the auth token there.
  // We save those keys to a separate JSON file and inject them back into
  // sessionStorage via addInitScript() at the start of each game-flow test.
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

  ensureDir(FIREBASE_SESSION);
  fs.writeFileSync(FIREBASE_SESSION, JSON.stringify(firebaseSession, null, 2));

  const tokenCount = Object.keys(firebaseSession).length;
  console.log(
    `[auth.setup] Auth state saved to ${STUDENT_AUTH}`,
    `\n[auth.setup] Firebase session (${tokenCount} key(s)) saved to ${FIREBASE_SESSION}`,
  );
});
