# Integration Tests

Integration tests verify that **multiple real modules work together correctly**. Unlike unit tests, these do not mock the function under test - they call the actual implementation and only mock external boundaries (Firebase network calls, UI components with complex import chains).

---

## Running Integration Tests

```bash
npm test                          # runs all tests including integration
npx jest src/tests/integration/  # run only integration tests
```

---

## What Makes a Test "Integration"

| Unit Test | Integration Test |
|---|---|
| Mocks the module under test | Calls the **real** module under test |
| Isolates a single function | Tests data flowing across multiple modules |
| No import chain side-effects | Lets the full import chain execute |

---

## Current Test Files

### Testing `database.js` (prerequisites)

Several integration tests import `src/firebase/database.js` directly. Because that module registers `onAuthStateChanged` at load time, use the same overrides as `pose-pipeline.test.js`:

1. **`firebase/auth`** — mock `onAuthStateChanged` so it never invokes its callback (avoids the `formatDate` temporal dead zone when the default `jest.setup.js` mock fires synchronously).
2. **`CurricularModule`** — mock `../../components/CurricularModule/CurricularModule.js` (or the path relative to your test file) so Jest can resolve the side-effect import inside `database.js`.

See `pose-pipeline.test.js` and `database-writes.test.js` for working examples. Firebase RTDB continues to be satisfied by `__mocks__/firebase/database.js` (no emulator).

Broader `database.js` behavior is covered by several focused unit files under `src/tests/unit/firebase/` (names prefixed with `database.`), which mock `userDatabase`, `jsonTOcsv`, and `globalThis.getPlayGame` where the implementation expects them. See `database.exports-org-wrappers-session-writes.test.js`, `database.rtdb-reads-lists-authorization.test.js`, `database.jest.rtdb-mocks.js`, and related files in that folder.

### `pose-pipeline.test.js`

**Purpose:** Verify that pose match events correctly flow through `src/firebase/database.js` and produce the right Firebase `set()` calls.

**What is real:**
- `writeToDatabasePoseMatch()` - real implementation
- `writeToDatabasePoseStart()` - real implementation
- Path-building logic (`_GameData/${gameId}/.../${poseName} Match GMT`)

**What is mocked:**
- `firebase/database` - `set`, `ref`, etc. (no real network calls)
- `firebase/auth` - `onAuthStateChanged` stubbed to prevent a module initialization timing issue (see note below)
- `CurricularModule` - heavy UI import not used by pose write functions

**Tests cover:**
1. A pose match calls `set()` once
2. The database path contains the `gameId`
3. The database path contains the pose name + correct suffix (`Match GMT` / `Begin GMT`)
4. The written value is a UTC timestamp string
5. Three sequential poses each produce a separate write
6. Sequential poses write different paths
7. Full lifecycle (start -> match) writes twice with correct path suffixes

---

### `database-writes.test.js`

**Purpose:** Cover `_PoseData` session initialization, `endSession` frame flush paths (via `update()`), and additional `_GameData` student-flow writes (`writeToDatabaseIntuitionEnd`, `writeToDatabaseMCQEnd`, `writeToDatabaseOutroStart`).

**What is real:** `initializeSession`, `endSession`, `bufferPoseData`, and the listed `writeToDatabase*` exports from `database.js`.

**What is mocked:** Same as `pose-pipeline.test.js` (`firebase/auth`, `firebase/database`, `CurricularModule`).

**Tests cover:** `_PoseData/...` ref segments include `orgId`, `gameId`, and session UUID; `set` payload for session metadata includes `sessionStartTime` as a UTC string; duplicate init is skipped; buffered frames trigger `update()` with paths containing `orgId`, `gameId`, UUID, and `frames`, and batch values contain JSON pose data plus UTC timestamps; `getBufferSize` / `flushFrameBuffer` guard (session not initialized); `loadGameDialoguesFromFirebase` path and snapshot handling; `writeToDatabasePoseAuth` (`push` to `/PoseAuthoring`); TF and MC answer batch writes; intuition / MCQ start and end, insight / pose-matching / tween / outro segments; intuition / MCQ end / outro start / end GMT string writes where applicable.

---

### `game-flow.test.js`

**Purpose:** Verify the full game loop at the logic layer - chapter progression, intervention, conjecture ordering, and the connection between pose matching and game state.

**What is real:**
- `GameMachine` - XState state machine driven with `interpret()`
- `Latin` - Latin square generator
- `reorder()` - pure function replicated from `Game.js`
- `PoseMatching` - real component (pose canvas mocked out)

**What is mocked:**
- `firebase/database.js` - no real network calls
- `components/Pose/index.js` - PixiJS canvas replaced with a `<div>`
- `components/utilities/ErrorBoundary.js` - thin pass-through wrapper
- `components/Pose/pose_drawing_utilities` - `segmentSimilarity` and `matchSegmentToLandmarks` controlled via `jest.fn()`

**Tests cover:**
- Chapter progression: machine advances through chapters and reaches ending
- Conjecture index: `currentConjectureIdx` increments correctly each chapter
- Conjecture ordering: Latin square produces valid, deterministic orderings; `reorder()` applies them correctly
- Conjecture selection: `currentConjectureIdx` maps to the correct Latin-ordered conjecture at each step
- Intervention: fires at the configured index, resumes in `chapter` state afterward
- Pose match -> machine advance: `PoseMatching.onComplete` wired to `service.send('NEXT')` moves machine out of `intervention`
- No match -> machine stays: failed pose match leaves machine state unchanged

**Why `Chapter.js` and `Game.js` are not rendered:**

Both components import `@inlet/react-pixi` at the module level, which requires a real WebGL/Canvas context. Jest runs in jsdom, which does not provide WebGL - any attempt to render these components crashes the test runner before a single assertion runs. These tests cover the **logic layer** (state machine + ordering) and the **`PoseMatching` component** (no top-level PixiJS imports) instead.

---

## Important Notes

### Auth Mock Override

`jest.setup.js` mocks `onAuthStateChanged` to fire its callback **synchronously**. When `database.js` loads, this fires before `formatDate` is defined in that module (JavaScript temporal dead zone for `const`). The integration test overrides `onAuthStateChanged` to never call its callback, keeping module-level user variables as `undefined`. This does not affect test correctness - `gameId` and `poseName` are passed directly to the write functions and are always present in the path regardless of user session state.

### No Firebase Emulator Required

All Firebase writes are intercepted by `__mocks__/firebase/database.js`. No emulator setup, no real credentials, no network access needed.

---

## Adding New Integration Tests

1. Create a new file: `src/tests/integration/your-feature.test.js`
2. Import **real** source modules (not mocked versions)
3. Only mock external boundaries: Firebase, network calls, heavy UI components
4. Clear mock call counts in `beforeEach(() => { jest.clearAllMocks(); })`
5. Assert on mock call arguments to verify data reached the boundary correctly
6. If the component uses `setTimeout` (e.g. transition delays), add `jest.useFakeTimers()` at file level and call `jest.runOnlyPendingTimers()` inside `act()` before asserting on async state changes
