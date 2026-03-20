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
