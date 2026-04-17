// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sendToAllMachines, clickCanvas } from './helpers.js';

/**
 * Admin account management E2E tests.
 *
 * These tests run with the browser state saved by auth.setup.admin.js, so
 * they start already signed in as an Admin.  Set PLAYWRIGHT_ADMIN_EMAIL +
 * PLAYWRIGHT_ADMIN_PASSWORD in .env.e2e to enable them.
 *
 * Canvas architecture note:
 *   After sign-in the entire app UI lives inside a PixiJS <canvas> element.
 *   Playwright cannot query DOM nodes inside canvas, so:
 *     - Navigation uses sendToAllMachines() to fire XState events directly.
 *     - Button clicks inside modules use clickCanvas() at known relative coords.
 *     - create actions use window.prompt / window.alert, intercepted via
 *       page.on('dialog', ...).
 *     - State assertions check canvas visibility + absence of error boundary.
 *
 * Key button coordinates (fractions of canvas dimensions):
 *
 *   OrganizationManager:
 *     CREATE NEW ORGANIZATION → relX=0.80, relY=0.41  (x=0.65+0.15, y=0.35+0.06)
 *
 *   NewUserModule:
 *     Email InputBox  → relX=0.50, relY=0.375  (x=0.1+0.4, y=0.3+0.075)
 *     Role InputBox   → relX=0.50, relY=0.475  (x=0.1+0.4, y=0.4+0.075)
 *     ADD NEW USER    → relX=0.23, relY=0.565  (x=0.1+0.13, y=0.5+0.065)
 *
 *   UserManagementModule:
 *     CLASSES button  → relX=0.55, relY=0.92   (x=0.45+0.10, y=0.88+0.04)
 *
 * Prerequisites:
 *   - PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD in .env.e2e
 *   - The admin account must exist in Firebase with role="Admin"
 */

// ---------------------------------------------------------------------------
// Load the admin Firebase session saved by auth.setup.admin.js.
// We define this locally (not in helpers.js) because helpers.js is
// student-specific and hardcodes the student session path.
// ---------------------------------------------------------------------------

const ADMIN_FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/admin-firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

const HAS_ADMIN_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_ADMIN_EMAIL && process.env.PLAYWRIGHT_ADMIN_PASSWORD
);

/**
 * Injects the saved admin Firebase sessionStorage keys back into the browser
 * before any page JavaScript runs.  Same workaround as injectFirebaseSession()
 * in helpers.js, but pointed at the admin session file.
 *
 * @param {import('@playwright/test').Page} page
 */
async function injectAdminSession(page) {
  if (Object.keys(ADMIN_FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, ADMIN_FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// Scenario 1 — Sign in as admin → lands on admin panel
// ---------------------------------------------------------------------------
test.describe('1. sign in as admin @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('admin panel canvas is visible after admin authentication', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Navigate into the admin panel to confirm the role gives access.
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Create a new organization
// ---------------------------------------------------------------------------
test.describe('2. create a new organization @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('create organization: prompt fires and org list refreshes without error', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // PlayMenuMachine: main → admin → organizations
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ORGANIZATIONS');
    await page.waitForTimeout(2_000);

    // Use a timestamped name so repeated runs don't collide.
    const orgName = `E2E Org ${Date.now()}`;
    let promptFired = false;

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        promptFired = true;
        await dialog.accept(orgName);
      } else {
        // Dismiss any confirm/alert dialogs that arise.
        await dialog.accept();
      }
    });

    // OrganizationManager: CREATE NEW ORGANIZATION button at relX=0.80, relY=0.41
    // Note: handleCreateOrganization does NOT show a success alert — it silently
    // refreshes the org list. We assert the prompt fired and the canvas is healthy.
    await clickCanvas(page, 0.80, 0.41);
    await page.waitForTimeout(3_000);

    expect(promptFired).toBe(true);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Create a teacher account
// ---------------------------------------------------------------------------
test.describe('3. create a teacher account @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('teacher account: email and role prompts fire with Teacher role accepted', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // PlayMenuMachine: main → admin → addNewUser
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ADDNEWUSER');
    await page.waitForTimeout(2_000);

    let emailPromptFired = false;
    let rolePromptFired = false;

    // NewUserModule uses window.prompt for both email and role inputs.
    // The first click (email box) fires the email prompt;
    // the second click (role box) fires the role prompt.
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        const msg = dialog.message();
        if (/email/i.test(msg)) {
          emailPromptFired = true;
          // Use a unique address so the account doesn't already exist.
          await dialog.accept(`e2e-teacher-${Date.now()}@example.com`);
        } else if (/role/i.test(msg)) {
          rolePromptFired = true;
          await dialog.accept('Teacher');
        } else {
          await dialog.dismiss();
        }
      } else {
        await dialog.accept();
      }
    });

    // Click the email InputBox at relX=0.50, relY=0.375 to trigger the email prompt.
    await clickCanvas(page, 0.50, 0.375);
    await page.waitForTimeout(1_000);

    // Click the role InputBox at relX=0.50, relY=0.475 to trigger the role prompt.
    await clickCanvas(page, 0.50, 0.475);
    await page.waitForTimeout(1_000);

    expect(emailPromptFired).toBe(true);
    expect(rolePromptFired).toBe(true);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Create a student account
// ---------------------------------------------------------------------------
test.describe('4. create a student account @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('student account: email and role prompts fire with Student role accepted', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ADDNEWUSER');
    await page.waitForTimeout(2_000);

    let emailPromptFired = false;
    let rolePromptFired = false;

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        const msg = dialog.message();
        if (/email/i.test(msg)) {
          emailPromptFired = true;
          await dialog.accept(`e2e-student-${Date.now()}@example.com`);
        } else if (/role/i.test(msg)) {
          rolePromptFired = true;
          await dialog.accept('Student');
        } else {
          await dialog.dismiss();
        }
      } else {
        await dialog.accept();
      }
    });

    await clickCanvas(page, 0.50, 0.375);
    await page.waitForTimeout(1_000);
    await clickCanvas(page, 0.50, 0.475);
    await page.waitForTimeout(1_000);

    expect(emailPromptFired).toBe(true);
    expect(rolePromptFired).toBe(true);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Manage invitations list
// ---------------------------------------------------------------------------
test.describe('5. manage invitations list @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('invitations list loads without error', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // PlayMenuMachine: main → admin → organizations → invites
    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ORGANIZATIONS');
    await page.waitForTimeout(2_000);
    await sendToAllMachines(page, 'INVITES');
    await page.waitForTimeout(1_500);

    // InviteManagementModule renders on the same canvas.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Edge case: invalid role input shows validation error alert
//
// NewUserModule's sendRolePrompt() validates the entered role against the
// allowed list: Admin, Developer, Teacher, Student.
// Entering anything else triggers: alert('Error reading role: value not allowed')
// ---------------------------------------------------------------------------
test.describe('6. invalid input validation @admin', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_ADMIN_CREDENTIALS) testInfo.skip(true, 'Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in .env.e2e');
  });

  test('invalid role input shows validation error alert', async ({ page }) => {
    await injectAdminSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await sendToAllMachines(page, 'ADMIN');
    await page.waitForTimeout(1_500);
    await sendToAllMachines(page, 'ADDNEWUSER');
    await page.waitForTimeout(2_000);

    let validationAlertMessage = '';

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        // Supply an invalid role value to trigger the validation branch.
        await dialog.accept('InvalidRole');
      } else if (dialog.type() === 'alert') {
        validationAlertMessage = dialog.message();
        await dialog.accept();
      }
    });

    // Click the role InputBox at relX=0.50, relY=0.475.
    // NewUserModule calls sendRolePrompt() → prompt fires → invalid value → alert fires.
    await clickCanvas(page, 0.50, 0.475);
    await page.waitForTimeout(1_500);

    expect(validationAlertMessage).toMatch(/value not allowed/i);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
