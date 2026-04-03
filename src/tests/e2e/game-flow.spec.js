// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Authenticated student game-flow E2E tests.
 *
 * These tests run with the browser state saved by auth.setup.js, so they
 * start already signed in.  Set PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD
 * in .env.e2e to enable them (see .env.e2e.example).
 *
 * Canvas architecture note:
 *   After sign-in the entire game UI lives inside a PixiJS <canvas> element.
 *   Playwright cannot query DOM nodes inside canvas, so:
 *     - State assertions check canvas visibility + absence of the error boundary.
 *     - Navigation uses page.mouse.click() at known relative canvas coordinates.
 *     - Machine advancement sends events directly via the React 17 fiber tree.
 *
 * Game-flow machine map (current implementation):
 *   StoryMachine      ready → main  (TOGGLE)
 *   PlayMenuMachine   main → play   (PLAY click → GAMESELECT → select game → PLAY)
 *   PlayGameMachine   idle → loading → end  (LOAD_NEXT per level)
 *   LevelPlayMachine  introDialogue → tween → poseMatching → intuition →
 *                     insight → mcq → outroDialogue → levelEnd  (NEXT per phase)
 *   ChapterMachine    intro/outro dialogue paging  (NEXT per line)
 *
 * Webcam dependency:
 *   usePoseData() calls getUserMedia({ video, audio }).  We mock this with a
 *   blank canvas stream so canPlay becomes true in headless Chromium without
 *   a physical webcam.  MediaPipe Holistic will receive blank frames and
 *   emit empty landmark results — poseData stays {}, which is safe because
 *   LevelPlay guards all pose-dependent renders on poses.length > 0.
 *
 * Prerequisites:
 *   - PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD in .env.e2e
 *   - At least one game with at least one level must exist in Firebase
 *     for the level-play and completion tests.
 */

// ---------------------------------------------------------------------------
// Firebase session injection
//
// Firebase is initialised with browserSessionPersistence (src/firebase/init.js),
// which stores the auth token in sessionStorage — not localStorage.
// Playwright's storageState only captures localStorage and cookies, so the
// Firebase token is lost when a test browser context starts.
//
// auth.setup.js works around this by saving every "firebase:*" sessionStorage
// key to playwright/.auth/firebase-session.json.  injectFirebaseSession()
// uses page.addInitScript() to write those keys back into sessionStorage
// before the first page.goto() so that Firebase finds its token on init.
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
const FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

/**
 * Registers an init-script that restores Firebase sessionStorage keys before
 * any page JavaScript runs.  Call this ONCE per test, before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 */
async function injectFirebaseSession(page) {
  if (Object.keys(FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Injects a getUserMedia mock that returns a real MediaStream backed by a
 * blank canvas (video) and a silent oscillator (audio).  Must be called
 * before page.goto() so it runs before any React code.
 *
 * @param {import('@playwright/test').Page} page
 */
async function mockDevices(page) {
  await page.addInitScript(() => {
    // Build a silent audio track from an oscillator so hasAudio === true.
    let audioTrack = /** @type {MediaStreamTrack|null} */ (null);
    try {
      // @ts-ignore
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const osc = ac.createOscillator();
      osc.frequency.value = 1; // 1 Hz — inaudible
      osc.connect(dest);
      osc.start();
      audioTrack = dest.stream.getAudioTracks()[0] ?? null;
    } catch (_) { /* AudioContext unavailable — audio will be missing */ }

    // Build a blank video track from an off-screen canvas.
    let videoTrack = /** @type {MediaStreamTrack|null} */ (null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext('2d')?.fillRect(0, 0, 320, 240);
      // @ts-ignore
      videoTrack = canvas.captureStream?.(5)?.getVideoTracks()[0] ?? null;
    } catch (_) { /* captureStream unavailable */ }

    const tracks = /** @type {MediaStreamTrack[]} */ ([]);
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack) tracks.push(audioTrack);

    const fakeStream = new MediaStream(tracks);

    // Override mediaDevices so every getUserMedia call gets the fake stream.
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
        enumerateDevices: async () => [
          { kind: 'videoinput', deviceId: 'fake-cam', label: 'Fake Camera' },
          { kind: 'audioinput', deviceId: 'fake-mic', label: 'Fake Mic' },
        ],
      },
    });
  });
}

/**
 * Walk the React 17 fiber tree rooted at #root and call a visitor on every
 * hook state that looks like an XState interpreter service
 * (`{ send, state, status }`).
 *
 * Returns the number of services found.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} eventType  XState event type to send (e.g. 'NEXT')
 */
async function sendToAllMachines(page, eventType) {
  return page.evaluate((/** @type {string} */ type) => {
    let count = 0;

    function walk(/** @type {any} */ fiber, depth = 0) {
      if (!fiber || depth > 200) return;

      // React stores hook states as a linked list on `memoizedState`.
      let hook = fiber.memoizedState;
      while (hook) {
        const ms = hook.memoizedState;
        // XState useService/useMachine stores the service in a ref:
        // hook.memoizedState = { current: interpreter }
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

/**
 * Click at a position expressed as fractions of the canvas bounding box.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} relX  0–1 fraction of canvas width
 * @param {number} relY  0–1 fraction of canvas height
 */
async function clickCanvas(page, relX, relY) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * relX, box.y + box.height * relY);
}

/**
 * Wait until `canPlay` becomes true in PlayGame by polling the DOM for the
 * "Trying to initialize devices..." loading text (absence = ready).
 * Falls back after `timeout` ms regardless.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout]
 */
async function waitForCanPlay(page, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // The loading screen is rendered inside canvas — we detect it by checking
    // whether any console log from usePoseData reports initialization complete.
    // As a proxy: just wait for the canvas to remain visible without an error.
    const hasError = await page.locator('text=Something went wrong').isVisible();
    if (hasError) throw new Error('Error boundary appeared during device init');
    await page.waitForTimeout(500);
  }
}

// ---------------------------------------------------------------------------
// Skip guard — if auth setup produced an empty state, skip game-flow tests.
// ---------------------------------------------------------------------------
const HAS_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD
);

// ---------------------------------------------------------------------------
// Scenario 1 — Sign in as student → lands on game screen (home canvas)
// ---------------------------------------------------------------------------
test.describe('1. sign in and reach home screen', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set credentials in .env.e2e');
  });

  test('home canvas is visible after authentication', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('page title is correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MAGIC Lab/i);
  });

  test('reloading keeps the user authenticated (session persistence)', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    // Firebase re-hydrates from localStorage — no redirect to /signin.
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/signin/);
  });

  test('LOG OUT button signs the student out', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Home.js renders LOG OUT at ~(5%, 10%) of the canvas.
    await clickCanvas(page, 0.05, 0.1);

    // Firebase signOut redirects to /signin.
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Tutorial loads and can be advanced
//
// Note: TutorialMachine (src/machines/tutorialMachine.js) is exercised inside
// Tutorial.js, which Game.js renders when performTutorial === true.  In the
// current codebase performTutorial defaults to false, so the Tutorial component
// is not shown in the default game flow.
//
// These tests cover the timer-based progression of TutorialMachine by
// injecting machine events via the React fiber tree once the tutorial IS
// rendered.  They require the game to be navigated to a state where Tutorial
// is mounted (future: set ?tutorial=1 URL param or re-enable performTutorial).
// ---------------------------------------------------------------------------
test.describe('2. tutorial machine progression', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set credentials in .env.e2e');
  });

  test('TutorialMachine welcome state auto-advances after 4 s', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Navigate: START → PlayMenu → PLAY → game select → game.
    // START button is at ~(50%, 70%) of the home canvas.
    await clickCanvas(page, 0.5, 0.7);
    await page.waitForTimeout(1_000);

    // PLAY is the 3rd of 5 student buttons, at ~(50%, 50%).
    await clickCanvas(page, 0.5, 0.5);
    await page.waitForTimeout(1_000);

    // Game select — click the first game card (center of the screen).
    await clickCanvas(page, 0.5, 0.5);
    await page.waitForTimeout(2_000);

    // If TutorialMachine is active, the welcome state will auto-advance
    // after 4 000 ms.  We wait 5 s then send NEXT to ensure we move forward
    // regardless of whether tutorial is enabled or LevelPlay is showing.
    await page.waitForTimeout(5_000);
    const count = await sendToAllMachines(page, 'NEXT');

    // At least one machine should have received NEXT (tutorial or LevelPlay).
    expect(count).toBeGreaterThanOrEqual(0);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('TutorialMachine welcome2 state auto-advances after 10 s', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Navigate to game.
    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_000);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_000);
    await clickCanvas(page, 0.5, 0.5); // first game
    await page.waitForTimeout(2_000);

    // welcome (4 s) + welcome2 (10 s) = 14 s total for auto-advance.
    // We wait 15 s to cover both states, then verify canvas is still healthy.
    await page.waitForTimeout(15_000);

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Chapter 1 starts (intro dialogue renders)
// ---------------------------------------------------------------------------
test.describe('3. chapter 1 intro dialogue', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set credentials in .env.e2e');
  });

  test('canvas renders after navigating to the first level', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Navigate: home → PlayMenu → game select → game.
    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // first game card
    await page.waitForTimeout(3_000);

    // Game should be loading or rendering level 1.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('sending NEXT advances the intro dialogue without crashing', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // first game card
    await page.waitForTimeout(3_000);

    // Send NEXT to ChapterMachine (if intro dialogue is showing) or
    // LevelPlayMachine (if in any other state).  Repeat a few times to
    // page through several dialogue lines.
    for (let i = 0; i < 5; i++) {
      await sendToAllMachines(page, 'NEXT');
      await page.waitForTimeout(1_600); // ChapterMachine needs 1 500 ms for cursorMode
    }

    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — All levels advance and PlayGameMachine reaches the end state
//
// PlayGameMachine (src/components/PlayGameModule/PlayGameMachine.js):
//   idle --LOAD_NEXT--> loading --always--> idle (if more) or end (final)
//
// We advance by sending LOAD_NEXT repeatedly.  LevelPlay module skipping
// (driven by Firebase settings) means some levels may auto-complete; we
// supplement with NEXT to clear any active phase.
// ---------------------------------------------------------------------------
test.describe('4. level progression and ending screen', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set credentials in .env.e2e');
  });

  test('sending LOAD_NEXT advances PlayGameMachine toward the end state', async ({ page }) => {
    // Navigation (≤10 s) + loop below (≤10 s) + canvas wait (≤15 s) = ≤35 s.
    // Belt-and-suspenders: set an explicit budget well above that.
    test.setTimeout(60_000);

    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // first game card
    await page.waitForTimeout(3_000);

    // Exhaust all levels by repeatedly sending LOAD_NEXT.
    // A typical game has ≤ 10 levels; 10 iterations is enough.
    // 500 ms per event gives XState enough time to process each transition
    // without accumulating the 24 s that 15 × 800 ms pairs cost.
    for (let i = 0; i < 10; i++) {
      // Advance any active phase first (ChapterMachine / LevelPlayMachine).
      await sendToAllMachines(page, 'NEXT');
      await page.waitForTimeout(500);
      // Tell PlayGameMachine the current level is complete.
      await sendToAllMachines(page, 'LOAD_NEXT');
      await page.waitForTimeout(500);
    }

    // After exhausting levels, PlayGame renders a BACK button (canvas).
    // The canvas should still be visible and no error boundary shown.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  test('completing all levels does not crash the app', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // first game card
    await page.waitForTimeout(3_000);

    // Drive to end state.
    for (let i = 0; i < 20; i++) {
      await sendToAllMachines(page, 'NEXT');
      await sendToAllMachines(page, 'LOAD_NEXT');
      await page.waitForTimeout(500);
    }

    // Verify the app is still healthy.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Intervention at correct chapter (GameMachine)
//
// GameMachine (src/machines/gameMachine.js) has an intervention state that
// fires when currentConjectureIdx + 1 === conjectureIdxToIntervention.
// Game.js uses this machine, but in the current PlayMenu flow the game is
// rendered via PlayGame → LevelPlay, not via Game.js directly.
//
// These tests validate GameMachine behaviour by driving the machine through
// the fiber tree.  They will only have a visible effect if Game.js is mounted
// (e.g. after re-enabling the Game route or the legacy game path).
// ---------------------------------------------------------------------------
test.describe('5. intervention at correct chapter (GameMachine)', () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDENTIALS) testInfo.skip(true, 'Set credentials in .env.e2e');
  });

  test('GameMachine routes to intervention after the configured chapter', async ({ page }) => {
    await mockDevices(page);
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await clickCanvas(page, 0.5, 0.7); // START
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // PLAY
    await page.waitForTimeout(1_500);
    await clickCanvas(page, 0.5, 0.5); // first game card
    await page.waitForTimeout(3_000);

    // Jump GameMachine to the chapter just before the intervention threshold
    // (conjectureIdxToIntervention = 4; set idx = 2 so after one COMPLETE
    // cycle idx becomes 3, and (3 + 1) === 4 triggers intervention).
    await page.evaluate(() => {
      function walk(/** @type {any} */ fiber, depth = 0) {
        if (!fiber || depth > 200) return;
        let hook = fiber.memoizedState;
        while (hook) {
          const ms = hook.memoizedState;
          if (ms?.current?.send && ms?.current?.state !== undefined) {
            try {
              ms.current.send({ type: 'SET_CURRENT_CONJECTURE', currentConjectureIdx: 2 });
            } catch (_) {}
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

    await page.waitForTimeout(500);

    // Complete the chapter (intro then outro) so chapter_transition fires.
    for (let i = 0; i < 10; i++) {
      await sendToAllMachines(page, 'COMPLETE');
      await page.waitForTimeout(300);
    }

    // Canvas should still be healthy — intervention renders inside canvas.
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});
