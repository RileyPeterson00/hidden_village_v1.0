// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Sign-in page and routing E2E tests.
 *
 * These tests require NO Firebase credentials — they only exercise the HTML
 * form at /signin and the redirect logic in Story.js.
 *
 * Authenticated game-flow tests live in game-flow.spec.js.
 *
 * Tagged with @signin so Firefox can run only these as a cross-browser check
 * (see playwright.config.js grep filter on the "firefox" project).
 */

// ---------------------------------------------------------------------------
// 1. Sign-in page — @signin
// ---------------------------------------------------------------------------
test.describe('sign-in page @signin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signin');
  });

  test('renders email and password inputs and LOG IN button', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('input[type="submit"]')).toHaveValue('LOG IN');
  });

  test('renders the register / log in toggle button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
  });

  test('toggle switches the form to register mode', async ({ page }) => {
    await page.getByRole('button', { name: /register/i }).click();

    await expect(page.locator('input[type="submit"]')).toHaveValue('REGISTER');
    // Toggle text flips to the "log in" variant.
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  });

  test('toggle back from register restores login mode', async ({ page }) => {
    await page.getByRole('button', { name: /register/i }).click();
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page.locator('input[type="submit"]')).toHaveValue('LOG IN');
  });

  test('wrong credentials show an inline error message', async ({ page }) => {
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'badpassword');
    await page.click('input[type="submit"]');

    // Firebase rejects invalid credentials; SignIn.js renders .error-output.
    const error = page.locator('.error-output');
    await expect(error).toBeVisible({ timeout: 8_000 });
    await expect(error).toContainText(/incorrect/i);
  });

  test('submitting empty fields does not navigate away', async ({ page }) => {
    // HTML5 type="email" validation blocks the submit before Firebase is called.
    await page.click('input[type="submit"]');
    await expect(page).toHaveURL(/\/signin/);
  });
});

// ---------------------------------------------------------------------------
// 2. Unauthenticated routing
// ---------------------------------------------------------------------------
test.describe('unauthenticated routing', () => {
  test('visiting / while unauthenticated redirects to /signin', async ({ page }) => {
    // Story.js calls onAuthStateChanged; unauthenticated users are sent to /signin.
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });
});
