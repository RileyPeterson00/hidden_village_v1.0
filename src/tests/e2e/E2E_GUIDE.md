# Hidden Village — E2E Test Guide

> **Audience:** Any team member who needs to run, debug, or extend the Playwright
> end-to-end suite.  Read this before touching anything in `src/tests/e2e/`.

---

## Table of Contents

1. [Quick start](#1-quick-start)
2. [Repository layout and Playwright projects](#2-repository-layout-and-playwright-projects)
3. [How Authentication Works](#3-how-authentication-works)
4. [How Navigation Works (and Its Limits)](#4-how-navigation-works-and-its-limits)
5. [Test Scenarios — What Each Suite Actually Tests](#5-test-scenarios--what-each-suite-actually-tests)
6. [Known Gaps and Limitations](#6-known-gaps-and-limitations)
7. [Change Guide — What to Update and When](#7-change-guide--what-to-update-and-when)
8. [Improving the Tests (Recommended Future Work)](#8-improving-the-tests-recommended-future-work)
9. [Debugging Failures](#9-debugging-failures)

---

## 1. Quick Start

### Prerequisites

| Requirement | Notes |
|---|---|
| Node.js + npm | Already in the project |
| Playwright browsers | Run `npx playwright install` once |
| `.env` (repo root) | App / Firebase config — loaded by `playwright.config.js` (same as the dev server) |
| `.env.e2e` | Copy `.env.e2e.example` — student; optional teacher and admin for those suites (see below) |
| Dev server | Started automatically by Playwright via `webServer`, or run `npm run dev` on port `1234` first |

### `.env.e2e` (never committed)

Match `.env.e2e.example` in the repo root. **Student** accounts power `auth.setup.js`, `game-flow.spec.js`, `performance.spec.js`, and `firebase-latency.spec.js`:

```
PLAYWRIGHT_TEST_EMAIL=student@example.com
PLAYWRIGHT_TEST_PASSWORD=yourpassword
```

**Teacher** and **admin** path suites are optional until you set:

```
PLAYWRIGHT_TEACHER_EMAIL=…
PLAYWRIGHT_TEACHER_PASSWORD=…
PLAYWRIGHT_ADMIN_EMAIL=…
PLAYWRIGHT_ADMIN_PASSWORD=…
```

Each value must be a **real Firebase user** with the right **role** (Student, Teacher, or Admin) for that suite.

### Running the tests

```powershell
# All Playwright projects (headless)
npm run test:e2e

# Named package.json scripts
npm run test:e2e:headed
npm run test:e2e:ui

# Or pass flags to the default script
npm run test:e2e -- --headed
npm run test:e2e -- --ui

# One specific file
npx playwright test src/tests/e2e/game-flow.spec.js

# One project only
npx playwright test --project=performance
npx playwright test --project=firebase-latency

# One test by title substring
npx playwright test --grep "LOG OUT"
```

---

## 2. Repository layout and Playwright projects

### Files under `src/tests/e2e/`

```
E2E_GUIDE.md
helpers.js

# Auth setup (see playwright/.auth/ output)
auth.setup.js
auth.setup.teacher.js
auth.setup.admin.js

# Specs
student-journey.spec.js   # Sign-in + routing — no credentials (@signin; Firefox smoke)
game-flow.spec.js         # Student game-flow (student auth)
teacher-path.spec.js     # Teacher flows (teacher auth)
admin-path.spec.js        # Admin / orgs / invites (admin auth)
performance.spec.js       # FPS / load; seeds test data (student auth)
firebase-latency.spec.js  # Real Firebase SDK timing (student auth)
```

### `playwright/.auth/` (gitignored, generated on run)

| File | Used for |
|------|-----------|
| `student.json` | Playwright `storageState` (cookies + local origins) for student |
| `firebase-session.json` | `firebase:*` `sessionStorage` keys — injected before load |
| `test-context.json` | `{ uid, orgId, databaseURL }` — see `auth.setup.js` / performance helpers |
| `teacher.json` + `teacher-firebase-session.json` | Teacher |
| `admin.json` + `admin-firebase-session.json` | Admin |

If credentials for a role are missing, that setup may write **empty** state files; suites that need auth should skip or fail in a controlled way.

### `playwright.config.js` — projects (summary)

| Project | What runs |
|---------|-----------|
| `setup` | `auth.setup.js` (student) |
| `teacher-setup` | `auth.setup.teacher.js` |
| `admin-setup` | `auth.setup.admin.js` |
| `chromium` | Everything in `e2e/` **except** setup files, `game-flow.spec.js`, `performance.spec.js`, and `firebase-latency.spec.js` (those have dedicated projects) |
| `chromium-auth` | `game-flow.spec.js` with saved student state; depends on `setup` |
| `chromium-teacher` | `teacher-path.spec.js`; depends on `teacher-setup` |
| `chromium-admin` | `admin-path.spec.js`; depends on `admin-setup` |
| `firebase-latency` | `firebase-latency.spec.js`; depends on `setup` |
| `performance` | `performance.spec.js` (larger viewport, `video: on`); depends on `setup` |
| `firefox` | Same ignore rules as `chromium`, **grep** `@signin` only |

**Root:** `playwright.config.js`, `.env`, `.env.e2e`, `.env.e2e.example`.

`performance.spec.js` and `firebase-latency.spec.js` are **not** part of the `chromium` project, so a full `npm run test:e2e` runs each of those files **once** (in their named projects).

---

## 3. How Authentication Works

### The problem

Firebase is initialised in `src/firebase/init.js` with **`browserSessionPersistence`**.
This stores the auth token in the browser's **`sessionStorage`**, not `localStorage`.

Playwright's `storageState` API (which saves and restores browser state between
the setup project and the test projects) only captures **`localStorage` and cookies**.
It silently ignores `sessionStorage`.

Result: without a workaround, every test starts unauthenticated and gets redirected
to `/signin`.

### The solution (two-file auth state)

`auth.setup.js` saves **two** files after a successful sign-in:

| File | What it contains | Captured by |
|---|---|---|
| `playwright/.auth/student.json` | localStorage + cookies | Playwright `storageState` |
| `playwright/.auth/firebase-session.json` | All `firebase:*` sessionStorage keys | Custom `page.evaluate()` |

At the start of each game-flow test, `injectFirebaseSession(page)` calls
`page.addInitScript()` to write those sessionStorage keys back into the browser
**before any page JavaScript runs**.  Firebase initialises, finds its token in
`sessionStorage`, and considers the user already authenticated.

Teacher and admin suites use the same idea: separate `storageState` JSON files
and matching `*-firebase-session.json` files, loaded in `teacher-path.spec.js`
and `admin-path.spec.js` (see those files and `auth.setup.teacher.js` /
`auth.setup.admin.js`).

### What breaks this

| Change | Impact | Fix |
|---|---|---|
| `browserSessionPersistence` → `browserLocalPersistence` in `init.js` | Firebase now uses **IndexedDB** (not sessionStorage). The extraction in `auth.setup.js` reads sessionStorage and will find nothing. Tests fail silently (empty firebase-session.json). | Update `auth.setup.js` to read from IndexedDB instead. See §7. |

| `browserSessionPersistence` → `inMemoryPersistence` | Token is gone on every navigation. Cannot be saved at all. | Don't use inMemoryPersistence for a setup that relies on saved state. |

| Sign-in form changes (e.g., button selector) | Setup files submit with `input[type="email"]` / `password` / `input[type="submit"]`. | Update the same selectors in `auth.setup.js`, `auth.setup.teacher.js`, and `auth.setup.admin.js`. See §7. |

| Test account deleted or password changed | Setup step will fail, producing empty auth files. All game-flow tests will skip. | Update `.env.e2e`. |

| Firebase token TTL / refresh token revoked | Firebase access tokens expire (~1 hour) but are refreshed automatically using the refresh token stored alongside them. If the refresh token is revoked (e.g., account disabled), tests fail on auth. | Re-run the full suite to regenerate fresh tokens. |

---

## 4. How Navigation Works (and Its Limits)

### Current approach: coordinate clicks

Most navigation uses `clickCanvas(page, relX, relY)`, which clicks at a position
expressed as a **fraction of the canvas bounding box**:

```
clickCanvas(page, 0.5, 0.7)  →  horizontal centre, 70% down the canvas
```

Known click targets used in the suite:

| Target | Coordinates | Source component |
|---|---|---|
| START button | `(0.5, 0.7)` | `Home.js` — `x: width*0.5, y: height*0.7` |
| LOG OUT (Home) | `(0.05, 0.1)` | `Home.js` — `x: width*0.05, y: height*0.1` |
| PLAY button (Student, 5-button layout) | `(0.5, 0.5)` | `PlayMenu.js` — 3rd of 5 evenly-spaced buttons |

### Why coordinate clicks are fragile

- **They depend on layout constants in production code.** If a button moves, the
  click hits empty space with no error — the test just continues and assertions
  may still pass, hiding the breakage.
- **The PLAY button position changes with user role.** Students have 5 buttons;
  Admins and Teachers have 7. With 7 buttons the spacing is tighter, but PLAY
  happens to stay at ~50% because it is the 4th of 7 (index 3, same horizontal
  centre). This is coincidental and could change.
- **Game cards in `CurricularSelector` are at `y ≈ 22.5%`**, not `50%`. The
  "click first game card" call at `(0.5, 0.5)` currently misses all game cards.
  The tests pass anyway because their assertions only check canvas visibility,
  not whether a game was actually entered. See §6.

### Better alternatives (not yet implemented)

See §8 for a full discussion. The short version:

1. **Target XState machines by name** — extend `sendToAllMachines` to filter by
   the machine's `id` field. Zero layout dependency.
2. **Expose a `window.__TEST__` API** — in non-production builds, expose machine
   `send` functions on `window` so tests can call them via `page.evaluate()`.
3. **URL deep-linking** — pass `?state=playMenu` to skip navigation entirely.
   `Game.js` already reads `?condition=` and `?conjecture=` as a precedent.

---

## 5. Test Scenarios — What Each Suite Actually Tests

The **numbered scenarios** below describe **`game-flow.spec.js`** (authenticated
student). Other files:

| File | What it covers |
|------|----------------|
| `student-journey.spec.js` | Sign-in form, bad credentials, unauthenticated redirect to `/signin` — tag `@signin` (Firefox). |
| `teacher-path.spec.js` | Teacher class-management flows; canvas + `sendToAllMachines`; needs teacher env. |
| `admin-path.spec.js` | Admin org / invites / add-user style flows; needs admin env. |
| `performance.spec.js` | Seeded game, navigation toward pose-matching, FPS — see file header. |
| `firebase-latency.spec.js` | `onValue`, `get`, `set`, `update` timing via real SDK in page context. |

### Scenario 1 — Sign in and reach home screen (`1. sign in...`) — `game-flow.spec.js`

| Test | What it checks |
|---|---|
| `home canvas is visible after authentication` | Canvas appears after auth injection + goto('/') |
| `page title is correct` | `<title>` contains "MAGIC Lab" — no auth needed |
| `reloading keeps the user authenticated` | Firebase re-hydrates from sessionStorage after reload |
| `LOG OUT button signs the student out` | Clicking LOG OUT redirects to /signin |

### Scenario 2 — Tutorial machine progression (`2. tutorial machine...`)

These tests navigate to game select and then wait for `TutorialMachine` timer
states to fire.  **`performTutorial` is currently `false` in `Game.js`**, so
the Tutorial component is never mounted in the default flow.  These tests
exercise crash-detection only — they verify the canvas stays healthy while
waiting, not that the tutorial actually ran.

### Scenario 3 — Chapter 1 intro dialogue (`3. chapter 1 intro...`)

Navigates to game select, then sends `NEXT` to all machines five times.  Because
no game is actually selected (see §6), these events fire on inactive machines
and are silently ignored.  The tests verify the app does not crash.

### Scenario 4 — Level progression and ending screen (`4. level progression...`)

The most time-sensitive scenario.  Sends `LOAD_NEXT` and `NEXT` in a loop to
advance `PlayGameMachine` through all levels toward the `end` state.  Again,
because no game is selected, the machine is never mounted; the loop fires
harmlessly.  Has an explicit `test.setTimeout(60_000)` because the loop
previously caused a 30 s timeout before the global timeout was raised.

### Scenario 5 — GameMachine intervention (`5. intervention...`)

Uses `page.evaluate()` to directly set `currentConjectureIdx = 2` on
`GameMachine` via the fiber tree, then fires `COMPLETE` events to trigger the
intervention state.  **`Game.js` is not mounted in the current PlayMenu flow**
(the game is rendered by `PlayGame → LevelPlay`, not by `Game.js`), so these
events reach no machine and the test only verifies no crash occurs.

---

## 6. Known Gaps and Limitations

### No games are played end-to-end

The test account (`testing@gmail.com`) has no published games
(`isFinal: true` is required in Play mode by `CurricularSelector`).
Additionally, the game-card click coordinates are wrong (§4).
As a result, **scenarios 2–5 never actually enter a game**.  They test that
the app survives navigation to game select and a series of machine events, but
they do not test LevelPlay, ChapterMachine, pose matching, or the ending screen
for real.

**To fix this:** create at least one published game in the test account's
Firebase organisation (set `isFinal: true`), and fix the game-card click
coordinates or switch to machine-event navigation (§8).

### `TutorialMachine` and `GameMachine` are not exercised

`performTutorial` is `false` by default in `Game.js`, and `Game.js` is not in
the current render path.  Scenarios 2 and 5 are effectively no-ops for their
stated purpose.

### React fiber tree walk is React 17-specific

`sendToAllMachines` accesses `_reactRootContainer._internalRoot.current`, which
is a React 17 internal.  **React 18 changed the root API** (`createRoot`
instead of `render`).  If the app is upgraded to React 18, this will break
silently — the walk will find no fiber root and return 0 without error.

**Fix when upgrading React:**

```javascript
// React 18 root
const fiber = root?._reactFiber ?? root?.__reactFiber$...;
// Or use the new React DevTools hook: window.__REACT_DEVTOOLS_GLOBAL_HOOK__
```

### XState version assumptions

`sendToAllMachines` identifies a service by checking for `{ send, state }` on
a ref.  **XState v5 changed the interpreter API** significantly (services are
now `Actor` objects with different internals).  If the app migrates from
XState v4 to v5, the fiber walk will find nothing.

---

## 7. Change Guide — What to Update and When

### When Firebase persistence mode changes (`init.js`)

| New persistence | Where tokens are stored | Update needed |
|---|---|---|
| `browserSessionPersistence` (current) | `sessionStorage` | No change needed |
| `browserLocalPersistence` | **IndexedDB** (primary), localStorage (fallback) | `auth.setup.js`: replace sessionStorage extraction with IndexedDB read (see snippet below) |
| `inMemoryPersistence` | RAM only — lost on navigation | Cannot use saved tokens; tests must sign in on every page load |

**IndexedDB extraction snippet for `auth.setup.js`:**

```javascript
const firebaseSession = await page.evaluate(async () => {
  const result = {};
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('firebaseLocalStorageDb');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction(['firebaseLocalStorage'], 'readonly');
  const items = await new Promise((resolve, reject) => {
    const req = tx.objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const item of items) {
    result[item.fbase_key] = JSON.stringify(item.value);
  }
  return result;
});
```

Then in `injectFirebaseSession`, write to `localStorage` instead of
`sessionStorage` so Firebase finds it on init (IndexedDB persistence falls
back to localStorage for migration).

---

### When the sign-in form changes

`auth.setup.js` submits the form with:

```javascript
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('input[type="submit"]');
```

If the sign-in button changes from `<input type="submit">` to `<button>`:

```javascript
await page.click('button[type="submit"]');
// or by visible text:
await page.getByRole('button', { name: /log in/i }).click();
```

---

### When button layouts change in `PlayMenu.js` or `Home.js`

Find every `clickCanvas(page, relX, relY)` call in `game-flow.spec.js` and
recalculate the fractions from the component source.

The formula for evenly-spaced buttons in `PlayMenu.js`:

```
startingX  = 0.5 - 0.45           = 0.05 × width
spacing    = 0.9 / (numButtons-1) × width
button[i].x = (0.05 + i × spacing) / width   (as a fraction)
button[i].y = 0.5
```

A simpler long-term fix: switch to machine-event navigation (§8) and remove
coordinate clicks from scenarios 2–5 entirely.

---

### When the test account needs to be replaced

1. Create or reset the Firebase user(s) (student, and optionally teacher/admin).
2. Update `.env.e2e` with the new values.
3. **Delete** the generated JSON for that role so stale tokens are not reused:
   - **Student:** `playwright/.auth/student.json`, `firebase-session.json`, and `test-context.json` (if used)
   - **Teacher:** `playwright/.auth/teacher.json`, `teacher-firebase-session.json`
   - **Admin:** `playwright/.auth/admin.json`, `admin-firebase-session.json`
4. Run `npm run test:e2e` — the corresponding `auth.setup*.js` step recreates state.

---

### When a new XState machine is added to the app

`sendToAllMachines` automatically discovers all mounted services — no change
needed unless you need to target the new machine specifically.  In that case,
use the `sendToMachine(page, machineId, eventType)` pattern described in §8.

---

### When tests start timing out

The global timeout is set to **90 seconds** in `playwright.config.js`.  If a
test reliably hits this:

1. Check whether the test is waiting on real work or on a fixed
   `waitForTimeout` that can be shortened.
2. If real work is slow (Firebase round-trips, MediaPipe init), add a
   `test.setTimeout(N)` inside the specific test rather than raising the global.
3. Audit `waitForTimeout` values — they are wall-clock sleeps.  Prefer
   `page.waitForFunction` or `expect(...).toBeVisible()` with a timeout instead.

---

## 8. Improving the Tests (Recommended Future Work)

### 8.1 Fix game-card selection

The `CurricularSelector` UI uses a **two-step select-then-confirm** flow:
click a row to highlight it → click OK to proceed.  Game rows render at
approximately `y = 22.5%` of the canvas, not `50%`.

Minimal fix — replace the broken click with correct coordinates:

```javascript
await clickCanvas(page, 0.4, 0.225); // name column of first game row
await page.waitForTimeout(500);
await clickCanvas(page, 0.68, 0.93); // OK button
```

Better fix — use machine events (§8.2).

### 8.2 Add `sendToMachine(page, machineId, eventType)`

Extend the fiber-walk helper to target a specific machine by its XState `id`:

```javascript
async function sendToMachine(page, machineId, eventType) {
  return page.evaluate(({ id, type }) => {
    function walk(fiber, depth = 0) {
      if (!fiber || depth > 200) return false;
      let hook = fiber.memoizedState;
      while (hook) {
        const ms = hook.memoizedState;
        if (ms?.current?.send && ms?.current?.machine?.id === id) {
          try { ms.current.send({ type }); return true; } catch (_) {}
        }
        hook = hook.next;
      }
      return walk(fiber.child, depth + 1) || walk(fiber.sibling, depth + 1);
    }
    const root = document.getElementById('root');
    // @ts-ignore
    return walk(root?._reactRootContainer?._internalRoot?.current);
  }, { id: machineId, type: eventType });
}
```

Navigation becomes readable and layout-independent:

```javascript
await sendToMachine(page, 'story', 'TOGGLE');        // home → PlayMenu
await sendToMachine(page, 'playMenu', 'GAMESELECT');  // → game select
// ... select game via data API or URL param ...
await sendToMachine(page, 'playMenu', 'PLAY');        // → PlayGame
```

Machine IDs are set via `createMachine({ id: '...' })` in each machine file.

### 8.3 Expose a test control API on `window`

In `Story.js` (or a dedicated test-only provider), conditionally expose machine
`send` functions in non-production builds:

```javascript
useEffect(() => {
  if (process.env.NODE_ENV !== 'production') {
    window.__TEST__ = { sendStory: send };
  }
}, [send]);
```

Tests then call:

```javascript
await page.evaluate(() => window.__TEST__.sendStory({ type: 'TOGGLE' }));
```

This survives React upgrades, XState upgrades, and layout changes.

### 8.4 URL deep-linking for skipping navigation

`Game.js` already reads `?condition=` and `?conjecture=` from the URL.  Extend
this pattern so tests can jump to a specific app state:

```javascript
await page.goto('/?skipToPlayMenu=1');
```

This eliminates multi-step navigation and the timing sensitivity that comes
with it.

### 8.5 Seed Firebase test data

Create a dedicated test game in the Firebase project:
- `isFinal: true` (published, visible in Play mode)
- Assigned to the test account's organisation
- At least one level with minimal content

This lets scenarios 3 and 4 actually exercise `LevelPlay`, `ChapterMachine`,
and `PlayGameMachine` end-to-end.

---

## 9. Debugging Failures

### Auth failures (redirected to `/signin`)

1. For **student** game-flow: `playwright/.auth/firebase-session.json` should
   contain a `firebase:authUser:...` key. If it is `{}`, `auth.setup.js` did not
   capture a session. For teacher/admin, check `teacher-firebase-session.json` /
   `admin-firebase-session.json` similarly.
2. Delete the **role’s** `*.json` pair (and student `test-context.json` if
   relevant), then re-run the suite to regenerate.
3. Confirm `.env.e2e` by signing in manually in the app.
4. If persistence mode changed in `init.js`, see §7.

### Canvas never becomes visible

Usually means `Story.js` is stuck in the `loading` state — either `userName`,
`userRole`, or `userOrg` never resolved.  Check:
- Firebase database rules (does the test account have read access to user data?)
- Network tab in `--headed` mode for failed Firebase reads

### Tests fail only on CI

CI always starts a fresh dev server (`reuseExistingServer: false`).  If the
server takes more than 60 s to start, increase `webServer.timeout` in
`playwright.config.js`.  Also check that environment variables are set in the
CI pipeline (the `.env.e2e` file is gitignored).

### Timeout errors mid-loop

The global timeout is 90 s.  If a specific test reliably hits it, add
`test.setTimeout(N)` at the top of that test and audit its `waitForTimeout`
calls (see §7).

### "Something went wrong" appears

The React `ErrorBoundary` in `App.js` caught an unhandled exception.  Run in
`--headed` mode with the browser console open to see the full stack trace.  The
video artifact saved by `video: 'retain-on-failure'` also shows the exact
moment of the crash.

### Viewing failure artifacts

After a failing run, open the HTML report:

```powershell
npx playwright show-report
```

Each failed test includes a **screenshot**, **video**, and (on retry) a
**trace** that can be opened in Playwright Trace Viewer for step-by-step
replay.
