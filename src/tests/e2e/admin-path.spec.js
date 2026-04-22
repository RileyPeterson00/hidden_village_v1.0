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
 * Navigation pipeline after page.goto('/'):
 *   StoryMachine  ready → main            via TOGGLE  (mounts PlayMenu)
 *   PlayMenuMachine   main → admin        via ADMIN
 *   PlayMenuMachine   admin → organizations  via ORGANIZATIONS
 *   PlayMenuMachine   admin → addNewUser     via ADDNEWUSER
 *   PlayMenuMachine   organizations → invites via INVITES
 *
 * Button-coordinate derivation:
 *   Both RectButton and InputBox receive (x, y, width, height) as the
 *   logical bounding box, but internally draw
 *     drawRoundedRect(x, y, width * 0.4, height * 0.4).
 *   So the actual clickable centre is
 *     (x + width * 0.2,  y + height * 0.2).
 *
 *   Centres expressed as fractions of the canvas (relX, relY):
 *
 *   OrganizationManager (CREATE NEW ORGANIZATION button):
 *     x=W*0.65, y=H*0.35, w=W*0.3,  h=H*0.12
 *     → relX = 0.65 + 0.3  * 0.2 = 0.71
 *       relY = 0.35 + 0.12 * 0.2 = 0.374
 *
 *   NewUserModule (email InputBox):
 *     x=W*0.1,  y=H*0.3,  w=W*0.8,  h=H*0.15
 *     → relX = 0.1  + 0.8  * 0.2 = 0.26
 *       relY = 0.3  + 0.15 * 0.2 = 0.33
 *
 *   NewUserModule (role InputBox):
 *     x=W*0.1,  y=H*0.4,  w=W*0.8,  h=H*0.15
 *     → relX = 0.26
 *       relY = 0.4  + 0.15 * 0.2 = 0.43
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

/**
 * Transition StoryMachine from `ready` to `main` so that <PlayMenu> mounts.
 * Sends TOGGLE until the walker can see a second (PlayMenu) interpreter, or
 * until the attempt budget runs out.
 *
 * @param {import('@playwright/test').Page} page
 */
async function enterPlayMenu(page) {
  // Story.js also calls send('TOGGLE') itself once auth + org data are loaded,
  // so in many cases the state has already advanced to `main` before we reach
  // this line. We send anyway (TOGGLE on `main` is a no-op) to cover the case
  // where the auto-advance hasn't run yet.
  for (let i = 0; i < 6; i++) {
    await sendToAllMachines(page, 'TOGGLE');
    await page.waitForTimeout(400);
    // Once PlayMenu has mounted, a second interpreter (PlayMenuMachine) is
    // present in the fiber tree, so any event reaches ≥ 2 services.
    const reached = await sendToAllMachines(page, '__NOOP_PROBE__');
    if (reached >= 2) return;
  }
}

/**
 * Drive PlayMenuMachine from its initial `main` state through one or more
 * transitions, pausing between each so XState can settle and React can render
 * the next module before the next event fires.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} events
 */
async function navigateAdmin(page, events) {
  for (const event of events) {
    await sendToAllMachines(page, event);
    await page.waitForTimeout(1_500);
  }
}

const COORDS = {
  createNewOrg:  { relX: 0.71, relY: 0.374 },
  emailInputBox: { relX: 0.26, relY: 0.33  },
  roleInputBox:  { relX: 0.26, relY: 0.43  },
};

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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN']);

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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN', 'ORGANIZATIONS']);

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

    // OrganizationManager CREATE NEW ORGANIZATION button — see comment at the
    // top of this file for the coordinate derivation.
    // handleCreateOrganization does NOT show a success alert — it silently
    // refreshes the org list, so we only assert the prompt fired and the canvas
    // is healthy.
    await clickCanvas(page, COORDS.createNewOrg.relX, COORDS.createNewOrg.relY);
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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN', 'ADDNEWUSER']);

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

    await clickCanvas(page, COORDS.emailInputBox.relX, COORDS.emailInputBox.relY);
    await page.waitForTimeout(1_000);

    await clickCanvas(page, COORDS.roleInputBox.relX, COORDS.roleInputBox.relY);
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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN', 'ADDNEWUSER']);

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

    await clickCanvas(page, COORDS.emailInputBox.relX, COORDS.emailInputBox.relY);
    await page.waitForTimeout(1_000);
    await clickCanvas(page, COORDS.roleInputBox.relX, COORDS.roleInputBox.relY);
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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN', 'ORGANIZATIONS', 'INVITES']);

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

    await enterPlayMenu(page);
    await navigateAdmin(page, ['ADMIN', 'ADDNEWUSER']);

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

    // NewUserModule calls sendRolePrompt() → prompt fires → invalid value → alert fires.
    await clickCanvas(page, COORDS.roleInputBox.relX, COORDS.roleInputBox.relY);
    await page.waitForTimeout(1_500);

    expect(validationAlertMessage).toMatch(/value not allowed/i);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
