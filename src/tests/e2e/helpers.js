// @ts-check
/**
 * Shared helpers for Hidden Village E2E tests.
 *
 * Imported by game-flow.spec.js and performance.spec.js so that auth
 * injection, device mocking, machine navigation, and FPS sampling are
 * defined in one place.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Firebase session
// ---------------------------------------------------------------------------

/** @type {Record<string, string>} */
export const FIREBASE_SESSION = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/firebase-session.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

/** True when .env.e2e credentials are present. */
export const HAS_CREDENTIALS = !!(
  process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD
);

/**
 * Registers an init-script that restores Firebase sessionStorage keys before
 * any page JavaScript runs.  Call once per test, before page.goto().
 *
 * @param {import('@playwright/test').Page} page
 */
export async function injectFirebaseSession(page) {
  if (Object.keys(FIREBASE_SESSION).length === 0) return;
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      sessionStorage.setItem(key, value);
    }
  }, FIREBASE_SESSION);
}

// ---------------------------------------------------------------------------
// Device mocking
// ---------------------------------------------------------------------------

/**
 * Injects a getUserMedia mock that returns a real MediaStream backed by a
 * blank canvas (video) and a silent oscillator (audio).  Must be called
 * before page.goto() so it runs before any React code.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function mockDevices(page) {
  await page.addInitScript(() => {
    let audioTrack = /** @type {MediaStreamTrack|null} */ (null);
    try {
      // @ts-ignore
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const osc = ac.createOscillator();
      osc.frequency.value = 1;
      osc.connect(dest);
      osc.start();
      audioTrack = dest.stream.getAudioTracks()[0] ?? null;
    } catch (_) {}

    let videoTrack = /** @type {MediaStreamTrack|null} */ (null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext('2d')?.fillRect(0, 0, 320, 240);
      // @ts-ignore
      videoTrack = canvas.captureStream?.(5)?.getVideoTracks()[0] ?? null;
    } catch (_) {}

    const tracks = /** @type {MediaStreamTrack[]} */ ([]);
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack) tracks.push(audioTrack);

    const fakeStream = new MediaStream(tracks);

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

// ---------------------------------------------------------------------------
// XState machine helpers
// ---------------------------------------------------------------------------

/**
 * Walk the React 17 fiber tree rooted at #root and send an XState event to
 * every active interpreter service found.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} eventType  XState event type (e.g. 'NEXT')
 * @returns {Promise<number>} number of services that received the event
 */
export async function sendToAllMachines(page, eventType) {
  return page.evaluate((/** @type {string} */ type) => {
    let count = 0;
    const sent = new WeakSet();
    const visitedFibers = new WeakSet();

    // An interpreter exposes .send() and .state; this recognizes both plain
    // interpreters and XState actors that wrap the same contract.
    function isInterpreter(/** @type {any} */ candidate) {
      return candidate
        && typeof candidate === 'object'
        && typeof candidate.send === 'function'
        && candidate.state !== undefined;
    }

    // @xstate/react v1.x stores the interpreter inside useConstant, which
    // wraps the value as ref.current = { v: interpreter }. Generic useRef
    // hooks store it directly as ref.current = interpreter. Handle both.
    function collectCandidates(/** @type {any} */ ms) {
      const out = [];
      if (!ms || typeof ms !== 'object') return out;
      if ('current' in ms) {
        const inner = ms.current;
        out.push(inner);
        if (inner && typeof inner === 'object' && 'v' in inner) {
          out.push(inner.v);
        }
      }
      return out;
    }

    function walk(/** @type {any} */ fiber, depth = 0) {
      if (!fiber || depth > 400 || visitedFibers.has(fiber)) return;
      visitedFibers.add(fiber);

      let hook = fiber.memoizedState;
      while (hook) {
        for (const svc of collectCandidates(hook.memoizedState)) {
          if (isInterpreter(svc) && !sent.has(svc)) {
            sent.add(svc);
            try { svc.send({ type }); count++; } catch (_) {}
          }
        }
        hook = hook.next;
      }

      // react-pixi mounts its children in a separate reconciler; the Stage
      // class component stores the PixiFiber root on its instance as
      // `mountNode`, so we must descend into that root to find any hooks
      // (including useMachine) defined inside the canvas subtree.
      const stateNode = fiber.stateNode;
      if (stateNode && typeof stateNode === 'object') {
        const pixiMount = stateNode.mountNode;
        if (pixiMount && pixiMount.current) {
          walk(pixiMount.current, depth + 1);
        }
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
// Canvas interaction
// ---------------------------------------------------------------------------

/**
 * Click at a position expressed as fractions of the canvas bounding box.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} relX  0–1 fraction of canvas width
 * @param {number} relY  0–1 fraction of canvas height
 */
export async function clickCanvas(page, relX, relY) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * relX, box.y + box.height * relY);
}

/**
 * Wait until `canPlay` becomes true in PlayGame by polling the DOM for the
 * "Trying to initialize devices..." loading text (absence = ready).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout]
 */
export async function waitForCanPlay(page, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hasError = await page.locator('text=Something went wrong').isVisible();
    if (hasError) throw new Error('Error boundary appeared during device init');
    await page.waitForTimeout(500);
  }
}

// ---------------------------------------------------------------------------
// Navigate to an in-game state
// ---------------------------------------------------------------------------

/**
 * Start from the home screen and navigate into the first available game.
 * Assumes the page has already had Firebase session and device mocks injected,
 * and that page.goto('/') has already been called.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function navigateToGame(page) {
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });
  await clickCanvas(page, 0.5, 0.7); // START button
  await page.waitForTimeout(1_500);
  await clickCanvas(page, 0.5, 0.5); // PLAY button
  await page.waitForTimeout(1_500);
  await clickCanvas(page, 0.5, 0.5); // first game card
  await page.waitForTimeout(3_000);
}

// ---------------------------------------------------------------------------
// Test context (written by auth.setup.js after sign-in)
// ---------------------------------------------------------------------------

/** @typedef {{ uid: string|null, orgId: string|null, databaseURL: string|null }} TestContext */

/** @type {TestContext} */
export const TEST_CONTEXT = (() => {
  const p = path.join(process.cwd(), 'playwright/.auth/test-context.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { uid: null, orgId: null, databaseURL: null }; }
})();

// Fixed IDs make cleanup reliable even if the test crashes mid-run.
export const E2E_LEVEL_ID = 'e2e-perf-level-v1';
export const E2E_GAME_ID  = 'e2e-perf-game-v1';

/**
 * Write a minimal published game + level into Firebase using the REST API.
 * The level has stub pose data so PlayGameMachine can load it without crashing.
 * Idempotent — safe to call even if the data already exists.
 *
 * @param {import('@playwright/test').Page} page  Any live authenticated page (for fetch).
 * @returns {Promise<boolean>}  true on success, false if context is incomplete.
 */
export async function seedTestGame(page) {
  const { uid, orgId, databaseURL } = TEST_CONTEXT;
  if (!uid || !orgId || !databaseURL) {
    console.warn('[seedTestGame] Incomplete test context — skipping seed.', TEST_CONTEXT);
    return false;
  }

  // Parse access token from firebase-session.json.
  const accessToken = (() => {
    try {
      const session = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'playwright/.auth/firebase-session.json'), 'utf8')
      );
      const key = Object.keys(session).find((k) => k.startsWith('firebase:authUser'));
      return key ? JSON.parse(session[key]).stsTokenManager?.accessToken : null;
    } catch { return null; }
  })();

  if (!accessToken) {
    console.warn('[seedTestGame] No access token found — skipping seed.');
    return false;
  }

  const now = new Date().toISOString();

  // Minimal pose landmark structure — empty arrays satisfy LevelPlay's
  // hasStartPose / hasIntermediatePose / hasEndPose truthy checks and let
  // the component proceed past the early-return guard (line 185 LevelPlay.js).
  // The pose-matching screen will render with no skeleton drawn, which is
  // fine for FPS measurement.
  const emptyPose = {
    poseData: {
      poseLandmarks: [],
      leftHandLandmarks: [],
      rightHandLandmarks: [],
      faceLandmarks: [],
    },
  };

  const levelData = {
    UUID: E2E_LEVEL_ID,
    Name: 'E2E Performance Level',
    isFinal: true,
    isPublic: false,
    'Start Pose': emptyPose,
    'Intermediate Pose': emptyPose,
    'End Pose': emptyPose,
    'Text Boxes': {
      'Conjecture Name': 'E2E Performance Level',
      'Conjecture Statement': 'E2E test — no real conjecture.',
    },
    'Start Tolerance': '0.5',
    'Intermediate Tolerance': '0.5',
    'End Tolerance': '0.5',
    'Search Words': [],
    PIN: '',
    AuthorID: uid,
    createdBy: uid,
    Time: now,
    createdAt: now,
    updatedAt: now,
  };

  const gameData = {
    UUID: E2E_GAME_ID,
    name: 'E2E Performance Game',
    author: 'E2E Test',
    keywords: 'e2e test performance',
    pin: '',
    levelIds: [E2E_LEVEL_ID],
    isFinal: true,
    isPublic: false,
    Dialogues: [],
    Author: 'e2etest',
    AuthorID: uid,
    createdBy: uid,
    Time: now,
    createdAt: now,
    updatedAt: now,
  };

  const success = await page.evaluate(
    async ({ dbUrl, token, orgId: oid, levelId, gameId, level, game }) => {
      const base = `${dbUrl}?auth=${token}`;
      const put = (path, data) =>
        fetch(`${dbUrl}/${path}.json?auth=${token}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }).then((r) => r.ok);

      const [levelOk, gameOk] = await Promise.all([
        put(`orgs/${oid}/levels/${levelId}`, level),
        put(`orgs/${oid}/games/${gameId}`, game),
      ]);
      return levelOk && gameOk;
    },
    { dbUrl: databaseURL, token: accessToken, orgId, levelId: E2E_LEVEL_ID, gameId: E2E_GAME_ID, level: levelData, game: gameData }
  );

  if (success) {
    console.log(`[seedTestGame] Seeded game "${E2E_GAME_ID}" and level "${E2E_LEVEL_ID}" in org "${orgId}".`);
  } else {
    console.warn('[seedTestGame] One or more REST writes failed.');
  }
  return success;
}

/**
 * Delete the test game and level created by seedTestGame.
 * Safe to call even if the data doesn't exist (REST DELETE on a missing path is a no-op).
 *
 * @param {import('@playwright/test').Page} page  Any live authenticated page (for fetch).
 */
export async function cleanupTestGame(page) {
  const { orgId, databaseURL } = TEST_CONTEXT;
  if (!orgId || !databaseURL) return;

  const accessToken = (() => {
    try {
      const session = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'playwright/.auth/firebase-session.json'), 'utf8')
      );
      const key = Object.keys(session).find((k) => k.startsWith('firebase:authUser'));
      return key ? JSON.parse(session[key]).stsTokenManager?.accessToken : null;
    } catch { return null; }
  })();

  if (!accessToken) return;

  await page.evaluate(
    async ({ dbUrl, token, orgId: oid, levelId, gameId }) => {
      const del = (p) =>
        fetch(`${dbUrl}/${p}.json?auth=${token}`, { method: 'DELETE' });
      await Promise.all([
        del(`orgs/${oid}/levels/${levelId}`),
        del(`orgs/${oid}/games/${gameId}`),
      ]);
    },
    { dbUrl: databaseURL, token: accessToken, orgId, levelId: E2E_LEVEL_ID, gameId: E2E_GAME_ID }
  );

  console.log(`[cleanupTestGame] Removed "${E2E_GAME_ID}" and "${E2E_LEVEL_ID}" from org "${orgId}".`);
}

// ---------------------------------------------------------------------------
// Drive LevelPlayMachine to a specific state
// ---------------------------------------------------------------------------

/**
 * After navigateToGame(), LevelPlayMachine starts in 'introDialogue'.
 * This helper advances it to 'poseMatching' — the state where MediaPipe
 * processing, the pose skeleton overlay, and the countdown timer all run
 * simultaneously, making it the highest-load state in the app.
 *
 * Path: introDialogue --NEXT--> tween --NEXT--> poseMatching
 *
 * Each NEXT needs a short gap so XState can process the transition and React
 * can re-render before the next event fires.  ChapterMachine's 1 500 ms
 * 'reading' sub-state also means we need to wait at least 1 500 ms after the
 * first NEXT before the Chapter's cursor is ready, but because we send to ALL
 * machines LevelPlayMachine advances regardless of ChapterMachine's state.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function advanceToPoseMatching(page) {
  // Allow level data and settings to load from Firebase before sending events.
  await page.waitForTimeout(3_000);

  // introDialogue → tween
  await page.evaluate((type) => {
    function walk(/** @type {any} */ fiber, depth = 0) {
      if (!fiber || depth > 200) return;
      let hook = fiber.memoizedState;
      while (hook) {
        const ms = hook.memoizedState;
        if (ms && typeof ms === 'object' && 'current' in ms) {
          const svc = ms.current;
          if (svc && typeof svc.send === 'function' && svc.state !== undefined) {
            try { svc.send({ type }); } catch (_) {}
          }
        }
        hook = hook.next;
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    }
    const root = document.getElementById('root');
    // @ts-ignore
    walk(root?._reactRootContainer?._internalRoot?.current);
  }, 'NEXT');

  // Brief gap so XState processes the introDialogue → tween transition.
  await page.waitForTimeout(800);

  // tween → poseMatching
  await page.evaluate((type) => {
    function walk(/** @type {any} */ fiber, depth = 0) {
      if (!fiber || depth > 200) return;
      let hook = fiber.memoizedState;
      while (hook) {
        const ms = hook.memoizedState;
        if (ms && typeof ms === 'object' && 'current' in ms) {
          const svc = ms.current;
          if (svc && typeof svc.send === 'function' && svc.state !== undefined) {
            try { svc.send({ type }); } catch (_) {}
          }
        }
        hook = hook.next;
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    }
    const root = document.getElementById('root');
    // @ts-ignore
    walk(root?._reactRootContainer?._internalRoot?.current);
  }, 'NEXT');

  // Allow poseMatching to fully mount (webcam feed, skeleton overlay, timer).
  await page.waitForTimeout(1_500);
}

// ---------------------------------------------------------------------------
// FPS sampling
// ---------------------------------------------------------------------------

/**
 * Injects a requestAnimationFrame-based FPS sampler into the page.
 * Results are accumulated in window.__fpsData and can be read at any time
 * with collectFPSResults().
 *
 * Must be called via page.addInitScript() BEFORE page.goto() so the sampler
 * starts the moment the page begins rendering.
 *
 * Usage:
 *   await page.addInitScript(fpsSamplerScript);
 *   await page.goto('/');
 *   // ... interact ...
 *   const { avg, min, samples } = await collectFPSResults(page);
 */
export const fpsSamplerScript = () => {
  window.__fpsData = { samples: [], frameCount: 0, lastTimestamp: performance.now() };

  function tick(now) {
    window.__fpsData.frameCount++;

    const elapsed = now - window.__fpsData.lastTimestamp;
    if (elapsed >= 1000) {
      // Record frames-per-second for the completed 1-second window.
      const fps = Math.round((window.__fpsData.frameCount * 1000) / elapsed);
      window.__fpsData.samples.push(fps);
      window.__fpsData.frameCount = 0;
      window.__fpsData.lastTimestamp = now;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
};

/**
 * Read the FPS samples collected by fpsSamplerScript from the browser.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ avg: number, min: number, max: number, samples: number[], durationSeconds: number }>}
 */
export async function collectFPSResults(page) {
  return page.evaluate(() => {
    const data = window.__fpsData;
    if (!data || data.samples.length === 0) {
      return { avg: 0, min: 0, max: 0, samples: [], durationSeconds: 0 };
    }
    const avg = Math.round(data.samples.reduce((a, b) => a + b, 0) / data.samples.length);
    const min = Math.min(...data.samples);
    const max = Math.max(...data.samples);
    return { avg, min, max, samples: data.samples, durationSeconds: data.samples.length };
  });
}
