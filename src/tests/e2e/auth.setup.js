// @ts-check
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Unified auth setup — runs once before any project that depends on it.
 *
 * Performs three sequential sign-ins (student, teacher, admin) and saves two
 * files per role:
 *   playwright/.auth/<role>.json               — storageState (cookies + localStorage)
 *   playwright/.auth/<role>-firebase-session.json — Firebase sessionStorage keys
 *
 * WHY TWO FILES PER ROLE:
 *   Firebase uses browserSessionPersistence (init.js), storing its auth token
 *   in sessionStorage.  Playwright's storageState only captures localStorage
 *   and cookies, so the token is lost when a new test context starts.  We save
 *   every "firebase:*" sessionStorage key separately and inject them back via
 *   page.addInitScript() at the start of each authenticated test.
 *
 * If credentials are absent for a role, empty files are written so dependent
 *   tests can still be discovered and skip themselves via their HAS_CREDENTIALS
 *   guard.
 *
 * Env vars (set in .env.e2e):
 *   PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD       — student
 *   PLAYWRIGHT_TEACHER_EMAIL / PLAYWRIGHT_TEACHER_PASSWORD — teacher
 *   PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD     — admin
 */

// Exported paths consumed by the spec files.
export const STUDENT_AUTH       = path.join(process.cwd(), 'playwright/.auth/student.json');
export const FIREBASE_SESSION   = path.join(process.cwd(), 'playwright/.auth/firebase-session.json');
export const TEACHER_AUTH       = path.join(process.cwd(), 'playwright/.auth/teacher.json');
export const TEACHER_FIREBASE_SESSION = path.join(process.cwd(), 'playwright/.auth/teacher-firebase-session.json');
export const ADMIN_AUTH         = path.join(process.cwd(), 'playwright/.auth/admin.json');
export const ADMIN_FIREBASE_SESSION   = path.join(process.cwd(), 'playwright/.auth/admin-firebase-session.json');

/** @param {string} filePath */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Sign in and persist both storageState and Firebase sessionStorage keys.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ email: string, password: string, authPath: string, sessionPath: string, label: string }} opts
 */
async function authenticateAndSave(page, { email, password, authPath, sessionPath, label }) {
  if (!email || !password) {
    ensureDir(authPath);
    fs.writeFileSync(authPath, JSON.stringify({ cookies: [], origins: [] }));
    ensureDir(sessionPath);
    fs.writeFileSync(sessionPath, JSON.stringify({}));
    console.warn(`\n[auth.setup] No ${label} credentials — writing empty auth state.\n`);
    return;
  }

  await page.goto('/signin');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('input[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 20_000 });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  ensureDir(authPath);
  await page.context().storageState({ path: authPath });

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

  ensureDir(sessionPath);
  fs.writeFileSync(sessionPath, JSON.stringify(firebaseSession, null, 2));
  console.log(`[auth.setup] ${label} auth saved (${Object.keys(firebaseSession).length} Firebase key(s))`);
}

// ---------------------------------------------------------------------------
// One setup() per role — Playwright runs them sequentially in this file.
// ---------------------------------------------------------------------------

setup('authenticate as student', async ({ page }) => {
  await authenticateAndSave(page, {
    email:       process.env.PLAYWRIGHT_TEST_EMAIL ?? '',
    password:    process.env.PLAYWRIGHT_TEST_PASSWORD ?? '',
    authPath:    STUDENT_AUTH,
    sessionPath: FIREBASE_SESSION,
    label:       'student',
  });
});

setup('authenticate as teacher', async ({ page }) => {
  await authenticateAndSave(page, {
    email:       process.env.PLAYWRIGHT_TEACHER_EMAIL ?? '',
    password:    process.env.PLAYWRIGHT_TEACHER_PASSWORD ?? '',
    authPath:    TEACHER_AUTH,
    sessionPath: TEACHER_FIREBASE_SESSION,
    label:       'teacher',
  });
});

setup('authenticate as admin', async ({ page }) => {
  await authenticateAndSave(page, {
    email:       process.env.PLAYWRIGHT_ADMIN_EMAIL ?? '',
    password:    process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '',
    authPath:    ADMIN_AUTH,
    sessionPath: ADMIN_FIREBASE_SESSION,
    label:       'admin',
  });
});
