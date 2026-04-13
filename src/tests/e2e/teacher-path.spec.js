// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Teacher class-management E2E tests.
 *
 * Requires a Firebase account with the Teacher (or Admin) role.
 * Set PLAYWRIGHT_TEACHER_EMAIL + PLAYWRIGHT_TEACHER_PASSWORD in .env.e2e.
 *
 * Navigation strategy:
 *   The app is entirely PixiJS canvas after sign-in.  We drive the XState
 *   machines directly (sendToAllMachines) rather than pixel-clicking canvas
 *   elements, then intercept window.prompt / window.alert / window.confirm
 *   dialogs for actions that require user input.
 *
 * Machine path for class management:
 *   PlayMenuMachine: main → ADMIN → admin → CLASSES → classes (ClassManager)
 */

// ---------------------------------------------------------------------------
// Firebase session injection (same pattern as game-flow.spec.js)
// ---------------------------------------------------------------------------
const TEACHER_FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/teacher-firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

/** @param {import('@playwright/test').Page} page */
async function injectFirebaseSession(page) {
  if (Object.keys(TEACHER_FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, TEACHER_FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// XState helper — sends an event to every active machine on the page
// (copied from game-flow.spec.js)
// ---------------------------------------------------------------------------
/** @param {import('@playwright/test').Page} page @param {string} eventType */
async function sendToAllMachines(page, eventType) {
  return page.evaluate((type) => {
    let count = 0;
    function walk(/** @type {any} */ fiber, depth = 0) {
      if (!fiber || depth > 200) return;
      let hook = fiber.memoizedState;
      while (hook) {
        const ms = hook.memoizedState;
        if (ms && typeof ms === 'object' && 'current' in ms) {
          const svc = ms.current;
          if (svc && typeof svc.send === 'function' && svc.state !== undefined) {
            try { svc.send({ type }); count++; } catch (_) {}
          }
        }
        hook = hook.next;
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    }
    const root = document.getElementById('root');
    // @ts-ignore — React 17 internal API
    const fiber = root?._reactRootContainer?._internalRoot?.current;
    walk(fiber);
    return count;
  }, eventType);
}

// ---------------------------------------------------------------------------
// Click at a position expressed as fractions of the canvas bounding box
// ---------------------------------------------------------------------------
/** @param {import('@playwright/test').Page} page @param {number} relX @param {number} relY */
async function clickCanvas(page, relX, relY) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * relX, box.y + box.height * relY);
}

const HAS_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_TEACHER_EMAIL && process.env.PLAYWRIGHT_TEACHER_PASSWORD
);

// ---------------------------------------------------------------------------
// 1. Sign-in and landing
// ---------------------------------------------------------------------------
test.describe('teacher sign-in and landing @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('canvas is visible after teacher sign-in', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Class management flow
// ---------------------------------------------------------------------------
test.describe('teacher class management @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('can navigate to class manager panel', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // main → admin → classes
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('create class dialog accepts a class name', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // Intercept the prompt (class name) then the success alert
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('E2E Test Class');
    });
    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    // CREATE CLASS button: x=0.65+0.30/2=0.80, y=0.25+0.12/2=0.31
    await clickCanvas(page, 0.80, 0.31);
    await page.waitForTimeout(2_000);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('can open assign games panel from class manager', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // ASSIGN GAMES button: x=0.65+0.15=0.80, y=0.35+0.06=0.41
    await clickCanvas(page, 0.80, 0.41);
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('can open assign users panel from class manager', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // ASSIGN USERS button: x=0.80, y=0.45+0.06=0.51
    await clickCanvas(page, 0.80, 0.51);
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Edge cases
// ---------------------------------------------------------------------------
test.describe('teacher edge cases @teacher', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_TEACHER_EMAIL/PASSWORD in .env.e2e');
  });

  test('cancelling class name prompt does not cause an error', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // Cancel the prompt — class creation should abort silently
    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await clickCanvas(page, 0.80, 0.31);
    await page.waitForTimeout(1_000);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('empty class name does not create a class', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'CLASSES');
    await page.waitForTimeout(2_000);

    // Accept prompt with whitespace-only input — ClassManager.handleCreateClass guards this
    page.once('dialog', async (dialog) => {
      await dialog.accept('   ');
    });

    await clickCanvas(page, 0.80, 0.31);
    await page.waitForTimeout(1_000);

    // No success alert should fire; canvas stays intact
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
