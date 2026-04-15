// @ts-check
import { test, expect } from '@playwright/test';
import {
  injectFirebaseSession,
  mockDevices,
  navigateToGame,
  advanceToPoseMatching,
  fpsSamplerScript,
  collectFPSResults,
  seedTestGame,
  cleanupTestGame,
  HAS_CREDENTIALS,
} from './helpers.js';

/**
 * Performance E2E tests — FPS, load time, and low-end device simulation.
 *
 * These tests share the same auth setup as game-flow.spec.js (performance
 * project in playwright.config.js) and require credentials in .env.e2e.
 *
 * DATA SEEDING
 *   A minimal game + level ("E2E Performance Game") is written to Firebase
 *   in beforeAll using the REST API, and removed in afterAll.
 *   auth.setup.js captures the database URL and the test user's orgId during
 *   the sign-in phase and saves them to playwright/.auth/test-context.json —
 *   no extra env variables are required.
 *
 *   The seeded level includes minimal non-null pose data so it passes
 *   LevelPlay's hasStartPose / hasIntermediatePose / hasEndPose guard and
 *   allows the machine to advance all the way to poseMatching.
 *
 * REACHING poseMatching
 *   poseMatching is the highest-load state in the app: MediaPipe processes
 *   webcam frames, PixiJS renders the target pose skeleton, and the countdown
 *   timer animates simultaneously.  After navigateToGame(), advanceToPoseMatching()
 *   fires two NEXT events to drive LevelPlayMachine through:
 *     introDialogue --NEXT--> tween --NEXT--> poseMatching
 *
 * FPS SAMPLING
 *   fpsSamplerScript is injected via page.addInitScript() before page.goto().
 *   It attaches a requestAnimationFrame loop that appends one FPS reading per
 *   second to window.__fpsData.samples.  collectFPSResults() reads it back at
 *   the end of the test and returns { avg, min, max, samples, durationSeconds }.
 *
 * CPU THROTTLING
 *   The Chrome DevTools Protocol Emulation.setCPUThrottlingRate command slows
 *   the JS engine by the given factor.  4× ≈ low-end Chromebook.
 *   The throttled FPS test records the full per-second history as an annotation
 *   in the HTML report and only fails on a catastrophically low average (< 20).
 *   Individual dips never fail the test on their own.
 *
 * Run only these tests:
 *   npx playwright test performance.spec --project=performance
 */

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------
test.beforeEach(async ({}, testInfo) => {
  if (!HAS_CREDENTIALS) {
    testInfo.skip(true, 'Set credentials in .env.e2e to run performance tests');
  }
});

// ---------------------------------------------------------------------------
// One-time test game seed / cleanup
// A dedicated page is used solely for the REST calls so seeding does not
// pollute any individual test's page state.
// ---------------------------------------------------------------------------
/** @type {import('@playwright/test').Page} */
let seedPage;

test.beforeAll(async ({ browser }) => {
  seedPage = await browser.newPage();
  await injectFirebaseSession(seedPage);
  await seedPage.goto('/');
  await seedPage.locator('canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await seedTestGame(seedPage);
});

test.afterAll(async () => {
  if (seedPage) {
    await cleanupTestGame(seedPage);
    await seedPage.close();
  }
});

// ---------------------------------------------------------------------------
// 1. Canvas load time
// ---------------------------------------------------------------------------
test.describe('1. canvas load time', () => {
  test('home canvas is visible within 5 s on a standard desktop', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');

    const start = Date.now();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - start;

    test.info().annotations.push({
      type: 'canvas-load-ms',
      description: String(elapsed),
    });

    expect(elapsed).toBeLessThan(5_000);
  });

  test('canvas loads within 8 s under 4× CPU throttle (low-end device simulation)', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await injectFirebaseSession(page);
    await page.goto('/');

    const start = Date.now();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
    const elapsed = Date.now() - start;

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    test.info().annotations.push({
      type: 'canvas-load-throttled-ms',
      description: String(elapsed),
    });

    expect(elapsed).toBeLessThan(8_000);
  });
});

// ---------------------------------------------------------------------------
// 2. Home screen FPS (no game loaded)
// ---------------------------------------------------------------------------
test.describe('2. home screen FPS', () => {
  test('maintains ≥ 30 avg FPS on the home canvas for 5 s', async ({ page }) => {
    await page.addInitScript(fpsSamplerScript);
    await injectFirebaseSession(page);
    await page.goto('/');

    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(5_000);

    const { avg, min, samples } = await collectFPSResults(page);

    test.info().annotations.push({
      type: 'fps-home',
      description: `avg=${avg} min=${min} samples=${samples.length}s history=[${samples.join(',')}]`,
    });

    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(avg).toBeGreaterThanOrEqual(30);
    expect(min).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// 3. In-game FPS — measured at poseMatching state
//
// poseMatching is the most CPU/GPU-intensive state in the game:
//   - MediaPipe processes webcam frames in the background
//   - PixiJS renders the target pose skeleton overlay
//   - A countdown timer animates at 60 FPS
//
// The test drives LevelPlayMachine to this state via advanceToPoseMatching()
// before the FPS measurement window begins.
// ---------------------------------------------------------------------------
test.describe('3. in-game FPS (poseMatching state)', () => {
  test('maintains ≥ 30 avg FPS during pose matching', async ({ page }) => {
    test.setTimeout(75_000);

    await page.addInitScript(fpsSamplerScript);
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');

    await navigateToGame(page);
    // Drive LevelPlayMachine: introDialogue → tween → poseMatching
    await advanceToPoseMatching(page);

    // Collect 8 s of FPS data while in the poseMatching state.
    await page.waitForTimeout(8_000);

    const { avg, min, max, samples } = await collectFPSResults(page);

    test.info().annotations.push({
      type: 'fps-pose-matching',
      description: `avg=${avg} min=${min} max=${max} samples=${samples.length}s history=[${samples.join(',')}]`,
    });

    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(avg).toBeGreaterThanOrEqual(30);
    expect(min).toBeGreaterThanOrEqual(15);
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('records per-second FPS history at poseMatching under 4× CPU throttle', async ({ page }) => {
    // This test RECORDS rather than strictly enforces.
    // The complete per-second history is attached to the HTML report so you
    // can see individual frame drops without the test failing on a single dip.
    // Only a catastrophically low average (< 20 FPS) fails the test.
    test.setTimeout(120_000);

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.addInitScript(fpsSamplerScript);
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');

    const loadStart = Date.now();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
    const loadMs = Date.now() - loadStart;

    await navigateToGame(page);
    await advanceToPoseMatching(page);

    // Collect 8 s of throttled poseMatching FPS data.
    await page.waitForTimeout(8_000);

    const { avg, min, max, samples, durationSeconds } = await collectFPSResults(page);

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    // Full per-second history visible in the Playwright HTML report.
    test.info().annotations.push({
      type: 'fps-throttled-history',
      description: `[${samples.join(', ')}]`,
    });
    test.info().annotations.push({
      type: 'fps-throttled-summary',
      description: `avg=${avg} min=${min} max=${max} duration=${durationSeconds}s loadMs=${loadMs}`,
    });

    // Catastrophic floor only — individual dips never fail the test.
    if (samples.length >= 3) {
      expect(avg).toBeGreaterThanOrEqual(20);
    } else {
      expect(samples.length).toBeGreaterThanOrEqual(3);
    }

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Level transition timing
// ---------------------------------------------------------------------------
test.describe('4. level transition timing', () => {
  test('LOAD_NEXT transition completes within 2 s (no visible stall)', async ({ page }) => {
    test.setTimeout(75_000);

    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await navigateToGame(page);
    await advanceToPoseMatching(page);

    const start = await page.evaluate(() => performance.now());

    await page.evaluate(() => {
      function walk(/** @type {any} */ fiber, depth = 0) {
        if (!fiber || depth > 200) return;
        let hook = fiber.memoizedState;
        while (hook) {
          const ms = hook.memoizedState;
          if (ms?.current?.send && ms?.current?.state !== undefined) {
            try { ms.current.send({ type: 'LOAD_NEXT' }); } catch (_) {}
          }
          hook = hook.next;
        }
        walk(fiber.child, depth + 1);
        walk(fiber.sibling, depth + 1);
      }
      const root = document.getElementById('root');
      // @ts-ignore
      walk(root?._reactRootContainer?._internalRoot?.current);
    });

    await expect(page.locator('canvas')).toBeVisible({ timeout: 2_000 });
    const elapsed = await page.evaluate((s) => performance.now() - s, start);

    test.info().annotations.push({
      type: 'load-next-ms',
      description: String(Math.round(elapsed)),
    });

    expect(elapsed).toBeLessThan(2_000);
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
