/**
 * Integration tests: session lifecycle and student-flow RTDB writes in database.js
 *
 * Firebase RTDB is fully mocked. Auth is overridden so database.js initializes safely
 * (same pattern as pose-pipeline.test.js).
 */

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserSessionPersistence: { _name: 'SESSION' },
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signOut: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../components/CurricularModule/CurricularModule.js', () => ({
  Curriculum: {
    CurrentConjectures: [],
    CurrentUUID: null,
    getCurrentConjectures: jest.fn(() => []),
    setCurrentUUID: jest.fn(),
  },
}));

import {
  initializeSession,
  endSession,
  bufferPoseData,
  flushFrameBuffer,
  getBufferSize,
  loadGameDialoguesFromFirebase,
  writeToDatabasePoseStart,
  writeToDatabasePoseAuth,
  writeToDatabaseTFAnswer,
  writeToDatabaseMCAnswer,
  writeToDatabaseIntuitionStart,
  writeToDatabaseIntuitionEnd,
  writeToDatabaseMCQStart,
  writeToDatabaseMCQEnd,
  writeToDatabaseOutroStart,
  writeToDatabaseOutroEnd,
  writeToDatabaseInsightStart,
  writeToDatabaseInsightEnd,
  writeToDatabasePoseMatchingStart,
  writeToDatabasePoseMatchingEnd,
  writeToDatabaseTweenStart,
  writeToDatabaseTweenEnd,
} from '../../firebase/database.js';
import { set, ref, update, get, push } from 'firebase/database';

beforeEach(() => {
  jest.clearAllMocks();
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// initializeSession
// ---------------------------------------------------------------------------
describe('initializeSession → _PoseData session metadata', () => {
  test('ref path includes orgId, gameId, and session UUID', async () => {
    const gameId = 'game-init-001';
    const uuid = 'uuid-session-aaa';
    const orgId = 'org-xyz';

    await initializeSession(gameId, 12, uuid, orgId);

    expect(ref).toHaveBeenCalled();
    const pathArg = ref.mock.calls.find((c) => c[1].includes('_PoseData'))?.[1];
    expect(pathArg).toBeDefined();
    expect(pathArg).toContain(orgId);
    expect(pathArg).toContain(gameId);
    expect(pathArg).toContain(uuid);
  });

  test('set() is called once with a defined payload and UTC sessionStartTime string', async () => {
    await initializeSession('game-init-002', 12, 'uuid-session-bbb', 'org-acme');

    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0][1];
    expect(payload).toBeDefined();
    expect(typeof payload).toBe('object');
    expect(typeof payload.sessionStartTime).toBe('string');
    expect(payload.sessionStartTime.length).toBeGreaterThan(0);
    expect(payload.frameRate).toBe(12);
  });

  test('second initialize for the same session key does not call set again', async () => {
    const gameId = 'game-init-003';
    const uuid = 'uuid-session-ccc';
    const orgId = 'org-dup';

    await initializeSession(gameId, 12, uuid, orgId);
    expect(set).toHaveBeenCalledTimes(1);

    await initializeSession(gameId, 12, uuid, orgId);
    expect(set).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// endSession (teardown flush uses update(), not set)
// ---------------------------------------------------------------------------
describe('endSession → frame flush path', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    console.log.mockRestore();
  });

  test('when frames are buffered, update() targets a path containing orgId, gameId, and UUID', async () => {
    const gameId = 'game-end-001';
    const uuid = 'uuid-end-001';
    const orgId = 'org-end';

    await initializeSession(gameId, 12, uuid, orgId);
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', 'conj-end-1', gameId);
    await Promise.all(posePromises);

    await bufferPoseData({ test: 'pose-payload' }, gameId, uuid, 12, orgId);
    await endSession(gameId, uuid, 12, orgId);

    expect(update).toHaveBeenCalled();
    const framesRefArg = update.mock.calls[0][0];
    expect(framesRefArg.path).toContain(orgId);
    expect(framesRefArg.path).toContain(gameId);
    expect(framesRefArg.path).toContain(uuid);
    expect(framesRefArg.path).toContain('frames');
  });

  test('frame batch values include pose JSON and a UTC timestamp string', async () => {
    const gameId = 'game-end-002';
    const uuid = 'uuid-end-002';
    const orgId = 'org-end-2';

    await initializeSession(gameId, 12, uuid, orgId);
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', 'conj-end-2', gameId);
    await Promise.all(posePromises);

    await bufferPoseData({ k: 1 }, gameId, uuid, 12, orgId);
    await endSession(gameId, uuid, 12, orgId);

    const batch = update.mock.calls[0][1];
    const firstKey = Object.keys(batch)[0];
    const frame = batch[firstKey];
    expect(typeof frame.timestamp).toBe('string');
    expect(frame.timestamp.length).toBeGreaterThan(0);
    expect(typeof frame.pose).toBe('string');
    expect(JSON.parse(frame.pose)).toEqual({ k: 1 });
  });
});

// ---------------------------------------------------------------------------
// Student-flow writes (conjecture segment in path from prior pose start)
// ---------------------------------------------------------------------------
describe('writeToDatabaseIntuitionEnd / MCQEnd / OutroStart', () => {
  async function seedConjectureSession(gameId, conjectureId) {
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', conjectureId, gameId);
    await Promise.all(posePromises);
    set.mockClear();
    ref.mockClear();
  }

  test('writeToDatabaseIntuitionEnd: path includes gameId; set() once with UTC string', async () => {
    const gameId = 'game-intuition-1';
    await seedConjectureSession(gameId, 'conj-i-1');

    await writeToDatabaseIntuitionEnd(gameId);

    expect(set).toHaveBeenCalledTimes(1);
    const pathArg = ref.mock.calls[ref.mock.calls.length - 1][1];
    expect(pathArg).toContain(gameId);
    expect(pathArg).toContain('Intuition End GMT');
    const valueArg = set.mock.calls[0][1];
    expect(typeof valueArg).toBe('string');
    expect(valueArg.length).toBeGreaterThan(0);
  });

  test('writeToDatabaseMCQEnd: path includes gameId; set() once with UTC string', async () => {
    const gameId = 'game-mcq-1';
    await seedConjectureSession(gameId, 'conj-m-1');

    await writeToDatabaseMCQEnd(gameId);

    expect(set).toHaveBeenCalledTimes(1);
    const pathArg = ref.mock.calls[ref.mock.calls.length - 1][1];
    expect(pathArg).toContain(gameId);
    expect(pathArg).toContain('MCQ End GMT');
    expect(typeof set.mock.calls[0][1]).toBe('string');
  });

  test('writeToDatabaseOutroStart: path includes gameId; set() once with UTC string', async () => {
    const gameId = 'game-outro-1';
    await seedConjectureSession(gameId, 'conj-o-1');

    await writeToDatabaseOutroStart(gameId);

    expect(set).toHaveBeenCalledTimes(1);
    const pathArg = ref.mock.calls[ref.mock.calls.length - 1][1];
    expect(pathArg).toContain(gameId);
    expect(pathArg).toContain('Outro Start GMT');
    expect(typeof set.mock.calls[0][1]).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Buffer / flush helpers
// ---------------------------------------------------------------------------
describe('getBufferSize and flushFrameBuffer guards', () => {
  test('getBufferSize reflects buffered frames after bufferPoseData', async () => {
    const gameId = 'game-buf-1';
    const uuid = 'uuid-buf-1';
    const orgId = 'org-buf';

    await initializeSession(gameId, 12, uuid, orgId);
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', 'conj-buf-1', gameId);
    await Promise.all(posePromises);

    expect(getBufferSize()).toBe(0);
    await bufferPoseData({ a: 1 }, gameId, uuid, 12, orgId);
    expect(getBufferSize()).toBe(1);
  });

  test('flushFrameBuffer without initializeSession logs and does not update', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await flushFrameBuffer('game-x', 'uuid-x', 12, 'org-x', 'Pose 1-1');

    expect(warnSpy).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// loadGameDialoguesFromFirebase
// ---------------------------------------------------------------------------
describe('loadGameDialoguesFromFirebase', () => {
  test('returns [] and alerts when gameId is missing', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const result = await loadGameDialoguesFromFirebase('', 'org-1');

    expect(result).toEqual([]);
    expect(alertSpy).toHaveBeenCalledWith('No gameId provided!');
    alertSpy.mockRestore();
  });

  test('ref path uses orgs/{orgId}/games/{gameId}/Dialogues and returns data when snapshot exists', async () => {
    const dialogues = [{ id: 'd1', text: 'Hello' }];
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => dialogues,
    });

    const out = await loadGameDialoguesFromFirebase('game-dlg', 'org-acme');

    expect(out).toEqual(dialogues);
    const pathArg = ref.mock.calls[ref.mock.calls.length - 1][1];
    expect(pathArg).toBe('orgs/org-acme/games/game-dlg/Dialogues');
  });
});

// ---------------------------------------------------------------------------
// writeToDatabasePoseAuth (push)
// ---------------------------------------------------------------------------
describe('writeToDatabasePoseAuth', () => {
  test('push() uses /PoseAuthoring and payload includes poseData, state, tolerance', async () => {
    const poseData = { landmarks: [1, 2, 3] };
    await writeToDatabasePoseAuth(poseData, 'editing', 0.5);

    expect(push).toHaveBeenCalledTimes(1);
    const refArg = push.mock.calls[0][0];
    expect(refArg.path).toBe('/PoseAuthoring');
    const payload = push.mock.calls[0][1];
    expect(payload.poseData).toEqual(poseData);
    expect(payload.state).toBe('editing');
    expect(payload.tolerance).toBe(0.5);
    expect(typeof payload.timestamp).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// TF / MC answer writes
// ---------------------------------------------------------------------------
describe('writeToDatabaseTFAnswer and writeToDatabaseMCAnswer', () => {
  async function seedConjectureSession(gameId, conjectureId) {
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', conjectureId, gameId);
    await Promise.all(posePromises);
    set.mockClear();
    ref.mockClear();
  }

  test('writeToDatabaseTFAnswer: three set() calls; paths include gameId', async () => {
    const gameId = 'game-tf-1';
    await seedConjectureSession(gameId, 'conj-tf');

    await writeToDatabaseTFAnswer('true', 'false', gameId, 'Q1');

    expect(set).toHaveBeenCalledTimes(3);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.every((p) => p.includes(gameId))).toBe(true);
    expect(paths.some((p) => p.endsWith('/TF Given Answer'))).toBe(true);
    expect(set.mock.calls.some((c) => c[1] === false)).toBe(true);
  });

  test('writeToDatabaseMCAnswer: four set() calls; includes MCQ Answer Time GMT string', async () => {
    const gameId = 'game-mc-ans';
    await seedConjectureSession(gameId, 'conj-mc');

    await writeToDatabaseMCAnswer('A', 'B', gameId, 'Pick one');

    expect(set).toHaveBeenCalledTimes(4);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.includes('MCQ Answer Time GMT'))).toBe(true);
    const gmtIdx = ref.mock.calls.findIndex((c) => c[1].includes('MCQ Answer Time GMT'));
    expect(typeof set.mock.calls[gmtIdx][1]).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Additional phase starts / ends
// ---------------------------------------------------------------------------
describe('intuition / MCQ / outro / insight / pose-matching / tween writes', () => {
  async function seedConjectureSession(gameId, conjectureId) {
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', conjectureId, gameId);
    await Promise.all(posePromises);
    set.mockClear();
    ref.mockClear();
  }

  test('writeToDatabaseIntuitionStart: two set() calls; TF Question and TF Answer Time GMT', async () => {
    const gameId = 'game-int-start';
    await seedConjectureSession(gameId, 'conj-is');

    await writeToDatabaseIntuitionStart(gameId, 'Is it true?');

    expect(set).toHaveBeenCalledTimes(2);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.every((p) => p.includes(gameId))).toBe(true);
    expect(paths.some((p) => p.includes('TF Answer Time GMT'))).toBe(true);
    expect(set.mock.calls.map((c) => c[1])).toContain('Is it true?');
  });

  test('writeToDatabaseMCQStart: two set() paths; MCQ Start GMT is a string', async () => {
    const gameId = 'game-mcq-start';
    await seedConjectureSession(gameId, 'conj-ms');

    await writeToDatabaseMCQStart(gameId, 'Choose:');

    expect(set).toHaveBeenCalledTimes(2);
    const idx = pathsIndexForSuffix(ref, 'MCQ Start GMT');
    expect(typeof set.mock.calls[idx][1]).toBe('string');
    expect(set.mock.calls.map((c) => c[1])).toContain('Choose:');
  });

  test('writeToDatabaseOutroEnd: single GMT string under Outro End GMT', async () => {
    const gameId = 'game-outro-e';
    await seedConjectureSession(gameId, 'conj-oe');

    await writeToDatabaseOutroEnd(gameId);

    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Outro End GMT');
    expect(typeof set.mock.calls[0][1]).toBe('string');
  });

  test('writeToDatabaseInsightStart and InsightEnd write GMT strings', async () => {
    const gameId = 'game-insight';
    await seedConjectureSession(gameId, 'conj-in');

    await writeToDatabaseInsightStart(gameId);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Insight Start GMT');
    set.mockClear();
    ref.mockClear();

    await writeToDatabaseInsightEnd(gameId);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Insight End GMT');
  });

  test('writeToDatabasePoseMatchingStart / End include Pose Matching path segments', async () => {
    const gameId = 'game-pm';
    await seedConjectureSession(gameId, 'conj-pm');

    await writeToDatabasePoseMatchingStart(gameId);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Pose Matching Start GMT');
    set.mockClear();
    ref.mockClear();

    await writeToDatabasePoseMatchingEnd(gameId);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Pose Matching End GMT');
  });

  test('writeToDatabaseTweenStart / End use passed conjecture id in path', async () => {
    const gameId = 'game-tw';
    const conj = 'conj-from-arg';

    await writeToDatabaseTweenStart(gameId, conj);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain(gameId);
    expect(ref.mock.calls[0][1]).toContain(conj);
    expect(ref.mock.calls[0][1]).toContain('Tween Start GMT');
    set.mockClear();
    ref.mockClear();

    await writeToDatabaseTweenEnd(gameId, conj);
    expect(set).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toContain('Tween End GMT');
  });
});

function pathsIndexForSuffix(refMock, suffix) {
  const i = refMock.mock.calls.findIndex((c) => c[1].includes(suffix));
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}
