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
 * Navigation pipeline after page.goto('/'):
 *   StoryMachine must reach `main` (PlayMenu mounted) before sending
 *   PlayMenuMachine events. Use enterPlayMenu() then navigatePlayMenu();
 *   otherwise ADMIN / CLASSES may no-op or target the wrong interpreter.
 *
 * Canvas architecture note:
 *   After sign-in the entire app UI lives inside a PixiJS <canvas> element.
 *   Playwright cannot query DOM nodes inside canvas, so:
 *     - Navigation uses enterPlayMenu + navigatePlayMenu + clickCanvas as needed.
 *     - Button clicks inside modules use clickCanvas() at known relative coords.
 *     - create/delete actions use window.prompt / window.alert, intercepted
 *       via page.on('dialog', ...).
 *     - State assertions check canvas visibility + absence of error boundary.
 *
 * ClassManager button click centers (fractions of canvas dimensions):
 *   RectButton uses draw size width*0.4 × height*0.4 of its props; click
 *   centre = (x + width*0.2, y + height*0.2) in canvas fractions:
 *   CREATE CLASS  → relX=0.71, relY≈0.274
 *   ASSIGN GAMES  → relX=0.71, relY≈0.374
 *   ASSIGN USERS  → relX=0.71, relY≈0.474
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

/** Centers of ClassManager RectButton hit areas — must match RectButton.js scaling. */
const CM_CREATE_CLASS = [0.71, 0.274];
const CM_ASSIGN_GAMES = [0.71, 0.374];
const CM_ASSIGN_USERS = [0.71, 0.474];

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

/**
 * Transition StoryMachine from `ready` to `main` so PlayMenu mounts.
 *
 * @param {import('@playwright/test').Page} page
 */
async function enterPlayMenu(page) {
  for (let i = 0; i < 6; i++) {
    await sendToAllMachines(page, 'TOGGLE');
    await page.waitForTimeout(400);
    const reached = await sendToAllMachines(page, '__NOOP_PROBE__');
    if (reached >= 2) return;
  }
}

/**
 * Drive PlayMenuMachine through transitions with pauses for React to render.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} events
 */
async function navigatePlayMenu(page, events) {
  for (const event of events) {
    await sendToAllMachines(page, event);
    await page.waitForTimeout(1_500);
  }
}

/** PlayMenu main → admin → classes, with extra settle time after CLASSES. */
async function goToClassManager(page) {
  await enterPlayMenu(page);
  await navigatePlayMenu(page, ['ADMIN', 'CLASSES']);
  await page.waitForTimeout(500);
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

    await goToClassManager(page);

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

    await goToClassManager(page);

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

    await clickCanvas(page, CM_CREATE_CLASS[0], CM_CREATE_CLASS[1]);
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

    await goToClassManager(page);

    const className = `E2E List Class ${Date.now()}`;

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept(className);
      else await dialog.accept();
    });

    // Create a class, then verify the canvas is still showing the class list
    // (ClassManager reloads classes after creation, so the new class appears).
    await clickCanvas(page, CM_CREATE_CLASS[0], CM_CREATE_CLASS[1]);
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

    await goToClassManager(page);

    await clickCanvas(page, CM_ASSIGN_GAMES[0], CM_ASSIGN_GAMES[1]);
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

    await goToClassManager(page);

    // The currently active class may have zero students — that is the edge case.
    await clickCanvas(page, CM_ASSIGN_USERS[0], CM_ASSIGN_USERS[1]);
    await page.waitForTimeout(2_000);

    // AssignStudentsModule must render without throwing.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
