// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load test credentials from .env.e2e (never committed).
// See .env.e2e.example for the expected shape.
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

/** Path where auth.setup.js saves the signed-in browser state. */
const STUDENT_AUTH = 'playwright/.auth/student.json';
const TEACHER_AUTH = 'playwright/.auth/teacher.json';
const ADMIN_AUTH   = 'playwright/.auth/admin.json';

/**
 * Playwright configuration for Hidden Village E2E tests.
 *
 * Projects:
 *   setup         — signs in once and saves browser state.
 *   chromium      — sign-in page + routing (no auth required).
 *   chromium-auth — full game-flow tests (depends on setup).
 *   firefox       — smoke-checks the @signin tests on Firefox only.
 *
 * Run:
 *   npm run test:e2e              # headless
 *   npm run test:e2e -- --headed  # visible browser
 *   npm run test:e2e -- --ui      # Playwright UI mode
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/tests/e2e',

  // Tests within a project run sequentially (journey order matters).
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // Default per-test timeout.  Some game-flow tests include multi-second waits
  // (device initialisation, machine loops) that push past the 30 s default.
  timeout: 90_000,

  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:1234',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    // -----------------------------------------------------------------------
    // Auth setup: sign in once and persist browser storage state.
    // -----------------------------------------------------------------------
    {
      name: 'setup',
      testMatch: '**/auth.setup.js',
    },

    // -----------------------------------------------------------------------
    // Sign-in page + routing — no auth required; always runs.
    // -----------------------------------------------------------------------
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Exclude setup files and any suite that requires saved auth state.
      testIgnore: [
        '**/auth.setup.js',
        '**/game-flow.spec.js',
        '**/teacher-path.spec.js',
        '**/admin-path.spec.js',
      ],
    },

    // -----------------------------------------------------------------------
    // Full student game-flow — requires saved auth state from setup.
    // -----------------------------------------------------------------------
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STUDENT_AUTH,
      },
      testMatch: '**/game-flow.spec.js',
      dependencies: ['setup'],
    },

    // -----------------------------------------------------------------------
    // Firefox smoke check: only the @signin-tagged tests.
    // -----------------------------------------------------------------------
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/auth.setup.js', '**/game-flow.spec.js'],
      grep: /@signin/,
    },

    // -----------------------------------------------------------------------
    // Teacher class-management tests — reuses the shared setup project.
    // -----------------------------------------------------------------------
    {
      name: 'chromium-teacher',
      use: { ...devices['Desktop Chrome'], storageState: TEACHER_AUTH },
      testMatch: '**/teacher-path.spec.js',
      dependencies: ['setup'],
    },

    // -----------------------------------------------------------------------
    // Admin account-management tests — reuses the shared setup project.
    // -----------------------------------------------------------------------
    {
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_AUTH },
      testMatch: '**/admin-path.spec.js',
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1234',
    // Re-use a running dev server locally; always start fresh on CI.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
