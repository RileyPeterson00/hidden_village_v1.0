// @ts-check
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Auth setup file for the Teacher role — runs once before any test project
 * that depends on it.
 *
 * Signs in with the teacher credentials from .env.e2e, then saves:
 *   1. playwright/.auth/teacher.json          — localStorage + cookies (Playwright storageState)
 *   2. playwright/.auth/teacher-firebase-session.json — Firebase auth keys from sessionStorage
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
 *   PLAYWRIGHT_TEACHER_EMAIL
 *   PLAYWRIGHT_TEACHER_PASSWORD
 */

export const TEACHER_AUTH = path.join(process.cwd(), 'playwright/.auth/teacher.json');
export const TEACHER_FIREBASE_SESSION = path.join(
  process.cwd(),
  'playwright/.auth/teacher-firebase-session.json'
);

/** Ensure the directory exists before writing to it. */
function ensureDir(/** @type {string} */ filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

setup('authenticate as teacher', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEACHER_EMAIL;
  const password = process.env.PLAYWRIGHT_TEACHER_PASSWORD;

  if (!email || !password) {
    // Write empty state files so dependent projects can still be discovered.
    ensureDir(TEACHER_AUTH);
    fs.writeFileSync(TEACHER_AUTH, JSON.stringify({ cookies: [], origins: [] }));
    ensureDir(TEACHER_FIREBASE_SESSION);
    fs.writeFileSync(TEACHER_FIREBASE_SESSION, JSON.stringify({}));
    console.warn(
      '\n[auth.setup.teacher] PLAYWRIGHT_TEACHER_EMAIL / PLAYWRIGHT_TEACHER_PASSWORD not found in .env.e2e — writing empty auth state.\n' +
      '  Teacher-path tests will skip themselves automatically.\n'
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
  ensureDir(TEACHER_AUTH);
  await page.context().storageState({ path: TEACHER_AUTH });

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

  ensureDir(TEACHER_FIREBASE_SESSION);
  fs.writeFileSync(TEACHER_FIREBASE_SESSION, JSON.stringify(firebaseSession, null, 2));

  const tokenCount = Object.keys(firebaseSession).length;
  console.log(
    `[auth.setup.teacher] Auth state saved to ${TEACHER_AUTH}`,
    `\n[auth.setup.teacher] Firebase session (${tokenCount} key(s)) saved to ${TEACHER_FIREBASE_SESSION}`,
  );
});
