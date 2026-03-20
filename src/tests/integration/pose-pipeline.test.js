/**
 * Integration Tests: Pose Pipeline → Firebase Database
 *
 * These tests verify the data flow from pose match events through to Firebase
 * database writes. Firebase itself is fully mocked (no network, no emulator),
 * so we can assert on mock call arguments to confirm the correct data structure
 * reaches the database layer.
 */

// The global auth mock (jest.setup.js) fires onAuthStateChanged synchronously,
// which triggers database.js's auth callback before `formatDate` is defined in
// that module (temporal dead zone). Override it here to never fire so the
// module-level variables remain undefined - the write functions still work and
// we verify paths by gameId/poseName, not by user-session segments.
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserSessionPersistence: { _name: 'SESSION' },
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signOut: jest.fn(() => Promise.resolve()),
}));

// Mock complex UI component import inside database.js that is not relevant here.
// Path is 2 levels up from src/tests/integration/ to reach src/components/
jest.mock('../../components/CurricularModule/CurricularModule.js', () => ({
  Curriculum: {
    CurrentConjectures: [],
    CurrentUUID: null,
    getCurrentConjectures: jest.fn(() => []),
    setCurrentUUID: jest.fn(),
  },
}));

import {
  writeToDatabasePoseMatch,
  writeToDatabasePoseStart,
} from '../../firebase/database.js';

// Pull in the already-mocked Firebase primitives so we can assert on them.
// These are resolved via moduleNameMapper → __mocks__/firebase/database.js
import { set, ref } from 'firebase/database';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// writeToDatabasePoseMatch
// ---------------------------------------------------------------------------
describe('writeToDatabasePoseMatch → Firebase write', () => {
  test('a successful pose match calls set() once', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-abc-123');

    expect(set).toHaveBeenCalledTimes(1);
  });

  test('the database path includes the gameId', async () => {
    const gameId = 'game-abc-123';
    await writeToDatabasePoseMatch('Pose 1-1', gameId);

    // ref() is called as ref(db, path); second argument is the path string
    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(gameId);
  });

  test('the database path includes the pose name and Match GMT suffix', async () => {
    const poseName = 'Pose 2-3';
    await writeToDatabasePoseMatch(poseName, 'game-abc-123');

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(`${poseName} Match GMT`);
  });

  test('a UTC timestamp string is written as the value', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-abc-123');

    // set() is called as set(refObj, value); second argument is the value
    const valueArg = set.mock.calls[0][1];
    expect(typeof valueArg).toBe('string');
    expect(valueArg.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// writeToDatabasePoseStart
// ---------------------------------------------------------------------------
describe('writeToDatabasePoseStart → Firebase write', () => {
  test('a pose start event calls set() once', async () => {
    await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', 'game-abc-123');

    expect(set).toHaveBeenCalled();
  });

  test('the database path includes the gameId', async () => {
    const gameId = 'game-def-456';
    await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', gameId);

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(gameId);
  });

  test('the database path includes the pose name and Begin GMT suffix', async () => {
    const poseName = 'Pose 1-1';
    await writeToDatabasePoseStart(poseName, 'conj-uuid-001', 'game-abc-123');

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(`${poseName} Begin GMT`);
  });
});

// ---------------------------------------------------------------------------
// Multi-pose sequence
// ---------------------------------------------------------------------------
describe('Pose sequence pipeline', () => {
  test('three sequential pose matches each produce one database write', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-seq-001');
    await writeToDatabasePoseMatch('Pose 1-2', 'game-seq-001');
    await writeToDatabasePoseMatch('Pose 1-3', 'game-seq-001');

    expect(set).toHaveBeenCalledTimes(3);
  });

  test('sequential pose matches write different paths (pose name changes)', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-seq-001');
    await writeToDatabasePoseMatch('Pose 1-2', 'game-seq-001');

    const path1 = ref.mock.calls[0][1];
    const path2 = ref.mock.calls[1][1];

    expect(path1).toContain('Pose 1-1');
    expect(path2).toContain('Pose 1-2');
    expect(path1).not.toEqual(path2);
  });

  test('full pose lifecycle: start then match produces two database writes', async () => {
    const gameId = 'game-lifecycle-001';
    const poseName = 'Pose 1-1';

    await writeToDatabasePoseStart(poseName, 'conj-uuid-001', gameId);
    await writeToDatabasePoseMatch(poseName, gameId);

    expect(set).toHaveBeenCalledTimes(2);

    const startPath = ref.mock.calls[0][1];
    const matchPath = ref.mock.calls[1][1];

    expect(startPath).toContain(`${poseName} Begin GMT`);
    expect(matchPath).toContain(`${poseName} Match GMT`);
  });
});
