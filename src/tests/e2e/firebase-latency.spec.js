// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { injectFirebaseSession, TEST_CONTEXT, HAS_CREDENTIALS } from './helpers.js';

/**
 * Firebase latency E2E tests.
 *
 * These tests measure real Firebase SDK latency — using the same onValue,
 * get(), update(), and set() calls the app makes — not the REST API.
 *
 * WHY SDK CALLS INSTEAD OF REST:
 *   The app uses the Firebase JS SDK over a persistent WebSocket connection.
 *   REST fetch() calls go through a different transport path and would miss
 *   WebSocket handshake delays, SDK initialization overhead, and connection
 *   state changes that real users experience.
 *
 * HOW THE SDK RUNS INSIDE page.evaluate():
 *   The Firebase SDK is already bundled into the app.  After the page loads,
 *   we inject Firebase config via page.addInitScript() to initialize a
 *   dedicated measurement app instance (separate from the main app instance
 *   so there is no interference), then run timed SDK calls inside the browser
 *   via page.evaluate() and return the elapsed milliseconds.
 *
 * CLEANUP:
 *   Suites 4 and 5 write real data to RTDB.  Each test deletes its probe
 *   path in afterEach using the REST DELETE method (the same pattern used
 *   by cleanupTestGame in helpers.js).
 *
 * Prerequisites:
 *   - PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD in .env.e2e
 *   - The student account must exist in Firebase
 *   - auth.setup.js must have run (saves firebase-session.json + test-context.json)
 *
 * Run only these tests:
 *   npx playwright test --project=firebase-latency
 */

// ---------------------------------------------------------------------------
// Firebase config — read from environment (loaded by playwright.config.js)
// ---------------------------------------------------------------------------

const FIREBASE_CONFIG = {
  apiKey:            process.env.VITE_API_KEY            ?? process.env.apiKey            ?? '',
  authDomain:        process.env.VITE_AUTH_DOMAIN        ?? process.env.authDomain        ?? '',
  databaseURL:       process.env.VITE_DATABASE_URL       ?? process.env.databaseURL       ?? TEST_CONTEXT.databaseURL ?? '',
  projectId:         process.env.VITE_PROJECT_ID         ?? process.env.projectId         ?? '',
  storageBucket:     process.env.VITE_STORAGE_BUCKET     ?? process.env.storageBucket     ?? '',
  messagingSenderId: process.env.VITE_MESSAGING_SENDER_ID ?? process.env.messagingSenderId ?? '',
  appId:             process.env.VITE_APP_ID             ?? process.env.appId             ?? '',
};

// Fall back to the databaseURL captured during auth setup if env is missing.
if (!FIREBASE_CONFIG.databaseURL && TEST_CONTEXT.databaseURL) {
  FIREBASE_CONFIG.databaseURL = TEST_CONTEXT.databaseURL;
}

// ---------------------------------------------------------------------------
// Access token helper (same pattern as helpers.js seedTestGame)
// ---------------------------------------------------------------------------

function getAccessToken() {
  try {
    const session = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'playwright/.auth/firebase-session.json'), 'utf8')
    );
    const key = Object.keys(session).find((k) => k.startsWith('firebase:authUser'));
    return key ? JSON.parse(session[key]).stsTokenManager?.accessToken : null;
  } catch { return null; }
}

// Probe paths — fixed names make cleanup reliable even if a test crashes.
const PROBE_BASE = '_e2e_latency_probe';
const WRITE_PROBE  = `${PROBE_BASE}/batch`;
const SET_PROBE    = `${PROBE_BASE}/session`;

// ---------------------------------------------------------------------------
// Skip guard — runs before every test
// ---------------------------------------------------------------------------

test.beforeEach(async ({}, testInfo) => {
  if (!HAS_CREDENTIALS) {
    testInfo.skip(true, 'Set PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD in .env.e2e to run Firebase latency tests');
  }
});

// ---------------------------------------------------------------------------
// Suite 1 — Auth initialization latency
//
// Measures the full journey: page load → Firebase auth resolves → canvas
// visible.  This is the first Firebase operation every session depends on.
// ---------------------------------------------------------------------------
test.describe('1. auth initialization latency', () => {
  test('app canvas is visible within 8 s of page load', async ({ page }) => {
    await injectFirebaseSession(page);

    const start = Date.now();
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
    const elapsed = Date.now() - start;

    test.info().annotations.push({
      type: 'auth-init-ms',
      description: String(elapsed),
    });

    expect(elapsed).toBeLessThan(8_000);
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — onValue real-time listener latency
//
// onValue() opens a persistent WebSocket connection and delivers the first
// snapshot when Firebase sends it.  This is the primary read path for game
// data (games list, level settings, org settings) throughout the app.
//
// The measurement runs inside the browser so the real Firebase SDK WebSocket
// path is exercised — not the REST API.
// ---------------------------------------------------------------------------
test.describe('2. onValue real-time listener latency', () => {
  test('first onValue callback fires within 2 s of subscription', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    const orgId = TEST_CONTEXT.orgId;
    const databaseURL = TEST_CONTEXT.databaseURL ?? FIREBASE_CONFIG.databaseURL;

    const latencyMs = await page.evaluate(
      async ({ dbURL, oid, config }) => {
        // Dynamically import the Firebase SDK that is already bundled into the
        // app's window scope via the CDN compat build loaded by the page.
        // We initialise a separate named app ("e2e-latency") so this instance
        // does not interfere with the running app.
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const { getDatabase, ref, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

        const existingApp = getApps().find((a) => a.name === 'e2e-latency');
        const app = existingApp ?? initializeApp({ ...config, databaseURL: dbURL }, 'e2e-latency');
        const db = getDatabase(app);

        return new Promise((resolve, reject) => {
          const start = performance.now();
          const timeout = setTimeout(() => reject(new Error('onValue timeout after 5 s')), 5_000);

          const unsubscribe = onValue(
            ref(db, `orgs/${oid}/games`),
            () => {
              clearTimeout(timeout);
              unsubscribe();
              resolve(Math.round(performance.now() - start));
            },
            (err) => {
              clearTimeout(timeout);
              reject(err);
            }
          );
        });
      },
      { dbURL: databaseURL, oid: orgId, config: FIREBASE_CONFIG }
    );

    test.info().annotations.push({
      type: 'onvalue-first-emit-ms',
      description: String(latencyMs),
    });

    expect(latencyMs).toBeLessThan(2_000);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — get() one-shot read latency (p95 across 10 reads)
//
// get() is a one-shot read used in the app for loadGameDialoguesFromFirebase
// and other non-reactive fetches.  Running 10 sequential reads and checking
// p95 catches occasional slow reads that a single measurement would miss.
// ---------------------------------------------------------------------------
test.describe('3. get() one-shot read latency (p95)', () => {
  test('p95 of 10 sequential reads is under 2 s', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    const orgId = TEST_CONTEXT.orgId;
    const databaseURL = TEST_CONTEXT.databaseURL ?? FIREBASE_CONFIG.databaseURL;

    const samples = await page.evaluate(
      async ({ dbURL, oid, config }) => {
        // These https:// imports run inside the browser (page.evaluate), not Node.js.
        // Chromium supports dynamic import() from CDN URLs natively — linter warnings here are safe to ignore.
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

        const existingApp = getApps().find((a) => a.name === 'e2e-latency');
        const app = existingApp ?? initializeApp({ ...config, databaseURL: dbURL }, 'e2e-latency');
        const db = getDatabase(app);

        const results = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          await get(ref(db, `orgs/${oid}/games`));
          results.push(Math.round(performance.now() - start));
        }
        return results;
      },
      { dbURL: databaseURL, oid: orgId, config: FIREBASE_CONFIG }
    );

    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

    test.info().annotations.push({
      type: 'get-p95-ms',
      description: `p95=${p95}ms avg=${avg}ms samples=[${samples.join(',')}]`,
    });

    expect(p95).toBeLessThan(2_000);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — update() batch write latency
//
// Mirrors exactly what flushFrameBuffer() does in database.js (lines 200–222):
//   - Build a batch update object with 20 keyed frames
//     (realistic size: minBufferSize=5, maxBufferSize=100, default flush=8 s)
//   - Call update(framesRef, updates) and time how long it takes to resolve
//
// If this is slow, pose data is lost or delayed between flushes during gameplay.
//
// Cleanup: the probe path is deleted in afterEach.
// ---------------------------------------------------------------------------
test.describe('4. update() batch write latency', () => {
  let accessToken = '';
  let databaseURL = '';
  let orgId = '';

  test.beforeEach(() => {
    accessToken = getAccessToken() ?? '';
    databaseURL = TEST_CONTEXT.databaseURL ?? FIREBASE_CONFIG.databaseURL ?? '';
    orgId       = TEST_CONTEXT.orgId ?? '';
  });

  test.afterEach(async ({ page }) => {
    if (!accessToken || !databaseURL || !orgId) return;
    await page.evaluate(
      async ({ dbURL, token, oid, probe }) => {
        await fetch(`${dbURL}/orgs/${oid}/${probe}.json?auth=${token}`, { method: 'DELETE' });
      },
      { dbURL: databaseURL, token: accessToken, oid: orgId, probe: WRITE_PROBE }
    );
  });

  test('batch update of 20 frames resolves within 2 s', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    const latencyMs = await page.evaluate(
      async ({ dbURL, oid, probe, config }) => {
        // These https:// imports run inside the browser (page.evaluate), not Node.js.
        // Chromium supports dynamic import() from CDN URLs natively — linter warnings here are safe to ignore.
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const { getDatabase, ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

        const existingApp = getApps().find((a) => a.name === 'e2e-latency');
        const app = existingApp ?? initializeApp({ ...config, databaseURL: dbURL }, 'e2e-latency');
        const db = getDatabase(app);

        // Simulate a realistic pose frame batch (20 frames, same shape as
        // flushFrameBuffer builds in database.js lines 206-213).
        const batchTimestamp = Date.now().toString().padStart(15, '0');
        const updates = {};
        for (let i = 0; i < 20; i++) {
          const paddedIndex = i.toString().padStart(5, '0');
          updates[`batch_${batchTimestamp}_frame_${paddedIndex}`] = {
            pose: JSON.stringify({ poseLandmarks: [], leftHandLandmarks: [], rightHandLandmarks: [] }),
            timestamp: new Date().toUTCString(),
          };
        }

        const framesRef = ref(db, `orgs/${oid}/${probe}`);
        const start = performance.now();
        await update(framesRef, updates);
        return Math.round(performance.now() - start);
      },
      { dbURL: databaseURL, oid: orgId, probe: WRITE_PROBE, config: FIREBASE_CONFIG }
    );

    test.info().annotations.push({
      type: 'batch-update-ms',
      description: String(latencyMs),
    });

    expect(latencyMs).toBeLessThan(2_000);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — set() session initialization write latency
//
// Mirrors exactly what initializeSession() does in database.js (line 161):
//   - A single set() to _PoseData/{orgId}/{gameId}/... with session metadata
//
// This is a blocking write: no pose frames can be recorded until it resolves.
// If this is slow, the student stares at a loading screen before the level starts.
//
// Cleanup: the probe path is deleted in afterEach.
// ---------------------------------------------------------------------------
test.describe('5. set() session init write latency', () => {
  let accessToken = '';
  let databaseURL = '';
  let orgId = '';

  test.beforeEach(() => {
    accessToken = getAccessToken() ?? '';
    databaseURL = TEST_CONTEXT.databaseURL ?? FIREBASE_CONFIG.databaseURL ?? '';
    orgId       = TEST_CONTEXT.orgId ?? '';
  });

  test.afterEach(async ({ page }) => {
    if (!accessToken || !databaseURL || !orgId) return;
    await page.evaluate(
      async ({ dbURL, token, oid, probe }) => {
        await fetch(`${dbURL}/${probe}.json?auth=${token}`, { method: 'DELETE' });
      },
      { dbURL: databaseURL, token: accessToken, oid: orgId, probe: SET_PROBE }
    );
  });

  test('session init set() resolves within 1 s', async ({ page }) => {
    await injectFirebaseSession(page);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    const latencyMs = await page.evaluate(
      async ({ dbURL, oid, probe, config }) => {
        // These https:// imports run inside the browser (page.evaluate), not Node.js.
        // Chromium supports dynamic import() from CDN URLs natively — linter warnings here are safe to ignore.
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

        const existingApp = getApps().find((a) => a.name === 'e2e-latency');
        const app = existingApp ?? initializeApp({ ...config, databaseURL: dbURL }, 'e2e-latency');
        const db = getDatabase(app);

        // Simulate the session metadata object that initializeSession() writes
        // (database.js lines 150-158).
        const sessionData = {
          userId:           'e2e-latency-probe',
          userName:         'e2etest',
          deviceId:         'e2e-device-id',
          deviceNickname:   'e2e-device',
          frameRate:        12,
          loginTime:        new Date().toUTCString(),
          sessionStartTime: new Date().toUTCString(),
        };

        const sessionRef = ref(db, `${probe}/e2e-game/session`);
        const start = performance.now();
        await set(sessionRef, sessionData);
        return Math.round(performance.now() - start);
      },
      { dbURL: databaseURL, oid: orgId, probe: SET_PROBE, config: FIREBASE_CONFIG }
    );

    test.info().annotations.push({
      type: 'session-set-ms',
      description: String(latencyMs),
    });

    expect(latencyMs).toBeLessThan(1_000);
  });
});
