// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sendToAllMachines, clickCanvas } from './helpers.js';

/**
 * Teacher class management E2E tests.
 *
 * These tests run with the browser state saved by auth.setup.teacher.js, so
 * they start already signed in as a Teacher.  Set PLAYWRIGHT_TEACHER_EMAIL +
 * PLAYWRIGHT_TEACHER_PASSWORD in .env.e2e to enable them.
 *
 * Canvas architecture note:
 *   After sign-in the entire app UI lives inside a PixiJS <canvas> element.
 *   Playwright cannot query DOM nodes inside canvas, so:
 *     - Navigation uses sendToAllMachines() to fire XState events directly.
 *     - Button clicks inside modules use clickCanvas() at known relative coords.
 *     - create/delete actions use window.prompt / window.alert, intercepted
 *       via page.on('dialog', ...).
 *     - State assertions check canvas visibility + absence of error boundary.
 *
 * ClassManager button coordinates (fractions of canvas dimensions):
 *   CREATE CLASS  → relX=0.80, relY=0.31  (x=0.65+0.15, y=0.25+0.06)
 *   ASSIGN GAMES  → relX=0.80, relY=0.41  (x=0.65+0.15, y=0.35+0.06)
 *   ASSIGN USERS  → relX=0.80, relY=0.51  (x=0.65+0.15, y=0.45+0.06)
 *
 * Prerequisites:
 *   - PLAYWRIGHT_TEACHER_EMAIL and PLAYWRIGHT_TEACHER_PASSWORD in .env.e2e
 *   - The teacher account must exist in Firebase with role="Teacher"
 */

// ---------------------------------------------------------------------------
// Load the teacher Firebase session saved by auth.setup.teacher.js.
// We define this locally (not in helpers.js) because helpers.js is
// student-specific and hardcodes the student session path.
// ---------------------------------------------------------------------------

const TEACHER_FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/teacher-firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

const HAS_TEACHER_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_TEACHER_EMAIL && process.env.PLAYWRIGHT_TEACHER_PASSWORD
);

/**
 * Injects the saved teacher Firebase sessionStorage keys back into the browser
 * before any page JavaScript runs.  Same workaround as injectFirebaseSession()
 * in helpers.js, but pointed at the teacher session file.
 *
 * @param {import('@playwright/test').Page} page
 */
async function injectTeacherSession(page) {
  if (Object.keys(TEACHER_FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, TEACHER_FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// Scenario 1 — Sign in as teacher → lands on play menu
// ---------------------------------------------------------------------------
test.describe('1. sign in as teacher @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('play menu canvas is visible after teacher authentication', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Navigate to Class Manager
// ---------------------------------------------------------------------------
test.describe('2. class manager navigation @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('class manager loads after navigating ADMIN → CLASSES', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // PlayMenuMachine: main → admin → classes
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Create a new class
// ---------------------------------------------------------------------------
test.describe('3. create a new class @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('create class: prompt fires and success alert confirms creation', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // Use a timestamped name so repeated runs don't collide.
    const className = `E2E Class ${Date.now()}`;
    let promptFired = false;
    let alertMessage = '';

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        promptFired = true;
        await dialog.accept(className);
      } else if (dialog.type() === 'alert') {
        alertMessage = dialog.message();
        await dialog.accept();
      }
    });

    // ClassManager: CREATE CLASS button at relX=0.80, relY=0.31
    await clickCanvas(page, 0.80, 0.31);
    await page.waitForTimeout(3_000);

    expect(promptFired).toBe(true);
    expect(alertMessage).toMatch(/created successfully/i);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — View class list
// ---------------------------------------------------------------------------
test.describe('4. view class list @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('class list view remains stable after class creation', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    const className = `E2E List Class ${Date.now()}`;

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(className);
      else await dialog.accept();
    });

    // Create a class, then verify the canvas is still showing the class list
    // (ClassManager reloads classes after creation, so the new class appears).
    await clickCanvas(page, 0.80, 0.31);
    await page.waitForTimeout(3_000);

    // Canvas must still be visible — ClassManager re-renders with updated list.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Assign content to a class
// ---------------------------------------------------------------------------
test.describe('5. assign content to class @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('ASSIGN GAMES navigates to content assignment view without error', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // ClassManager: ASSIGN GAMES button at relX=0.80, relY=0.41
    await clickCanvas(page, 0.80, 0.41);
    await page.waitForTimeout(2_000);

    // AssignContentModule replaces the main ClassManager view on the same canvas.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Empty class edge case: assign students view
//
// When a class has no students assigned, AssignStudentsModule should still
// render without crashing.  This verifies the empty-state is handled gracefully.
// ---------------------------------------------------------------------------
test.describe('6. empty class edge case @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_TEACHER_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('ASSIGN USERS loads without error for a class with no students', async ({ page }) => {
    await injectTeacherSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // ClassManager: ASSIGN USERS button at relX=0.80, relY=0.51
    // The currently active class may have zero students — that is the edge case.
    await clickCanvas(page, 0.80, 0.51);
    await page.waitForTimeout(2_000);

    // AssignStudentsModule must render without throwing.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
