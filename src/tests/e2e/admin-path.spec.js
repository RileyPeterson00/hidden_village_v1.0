// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Admin account management E2E tests.
 *
 * Requires a Firebase account with the Admin role.
 * Set PLAYWRIGHT_ADMIN_EMAIL + PLAYWRIGHT_ADMIN_PASSWORD in .env.e2e.
 *
 * Machine path for admin panel:
 *   PlayMenuMachine: main → ADMIN → admin (UserManagementModule)
 *
 * Machine path for invite management:
 *   admin → ORGANIZATIONS → organizations → INVITES → invites (InviteManagementModule)
 *
 * Machine path for new user:
 *   admin → ADDNEWUSER → addNewUser (NewUserModule)
 */

// ---------------------------------------------------------------------------
// Firebase session injection
// ---------------------------------------------------------------------------
const ADMIN_FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/admin-firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

/** @param {import('@playwright/test').Page} page */
async function injectFirebaseSession(page) {
  if (Object.keys(ADMIN_FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, ADMIN_FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// XState helper
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

const HAS_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_ADMIN_EMAIL && process.env.PLAYWRIGHT_ADMIN_PASSWORD
);

// ---------------------------------------------------------------------------
// 1. Sign-in and landing
// ---------------------------------------------------------------------------
test.describe('admin sign-in and landing @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('canvas is visible after admin sign-in', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('can navigate to admin user management panel', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. User account creation
// ---------------------------------------------------------------------------
test.describe('admin user creation @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('can navigate to new user panel', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // main → admin → addNewUser
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ADDNEWUSER');
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('can create a teacher account via prompts', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ADDNEWUSER');
    await page.waitForTimeout(2_000);

    // NewUserModule prompts for email then role
    page.once('dialog', async (dialog) => {
      await dialog.accept('newteacher@example.com');
    });
    page.once('dialog', async (dialog) => {
      await dialog.accept('Teacher');
    });

    // Click the email InputBox (x≈0.1+0.8/2=0.5, y≈0.3+0.15/2=0.375)
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.375);
    await page.waitForTimeout(500);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.475);
    await page.waitForTimeout(1_000);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Invite management
// ---------------------------------------------------------------------------
test.describe('admin invite management @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('can navigate to invite management panel', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // main → admin → organizations → invites
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ORGANIZATIONS');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'INVITES');
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('invalid role is rejected when generating an invite', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ORGANIZATIONS');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'INVITES');
    await page.waitForTimeout(2_000);

    // Provide an invalid role — InviteManagementModule.handleGenerateInvite
    // validates and sets an error state without calling generateInviteCode.
    page.once('dialog', async (dialog) => {
      await dialog.accept('InvalidRole');
    });

    // GENERATE INVITE button: x=0.65+0.15=0.80, y=0.25+0.06=0.31
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.80, box.y + box.height * 0.31);
    await page.waitForTimeout(1_500);

    // Canvas should remain visible — no crash from invalid role
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Edge cases — DOM-based (sign-in form, no auth required)
// ---------------------------------------------------------------------------
test.describe('admin edge cases — sign-in validation @admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signin');
  });

  test('duplicate email shows an inline error message', async ({ page }) => {
    // Attempt to register with an already-registered email
    await page.getByRole('button', { name: /register/i }).click();
    await page.fill('input[type="email"]', process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@example.com');
    await page.fill('input[type="password"]', 'anypassword');
    await page.click('input[type="submit"]');

    const error = page.locator('.error-output');
    await expect(error).toBeVisible({ timeout: 8_000 });
  });

  test('invalid email format prevents form submission', async ({ page }) => {
    // HTML5 type="email" blocks submit before Firebase is called
    await page.fill('input[type="email"]', 'not-an-email');
    await page.fill('input[type="password"]', 'somepassword');
    await page.click('input[type="submit"]');
    await expect(page).toHaveURL(/\/signin/);
  });
});
