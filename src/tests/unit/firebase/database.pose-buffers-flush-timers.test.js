/**
 * database.js — pose buffers, flush, smart timers, promiseChecker
 *
 * Buffered pose frames, size flush, concurrent flush, startSmartAutoFlush, alert-on-rejection path.
 */

/**
 * Shared RTDB/auth mock pattern for database.js tests.
 */
globalThis.getPlayGame = jest.fn(() => false);

jest.mock('firebase/auth', () => require('./database.jest.rtdb-mocks').firebaseAuth());
jest.mock('../../../firebase/userDatabase.js', () => require('./database.jest.rtdb-mocks').userDatabase());
jest.mock('../../../components/CurricularModule/CurricularModule.js', () =>
  require('./database.jest.rtdb-mocks').curriculum()
);
jest.mock('../../../firebase/jsonTOcsv.js', () => require('./database.jest.rtdb-mocks').jsonToCsv());

import {
  snapshotVal,
  fillLocalStorageForDraftOrPublish,
  setupDatabaseRtdbTestBeforeEach,
} from './database.test.helpers.js';

import { getCurrentUserContext } from '../../../firebase/userDatabase.js';
import { Curriculum } from '../../../components/CurricularModule/CurricularModule.js';
import { convertJsonToCsv } from '../../../firebase/jsonTOcsv.js';
import {
  keysToPush,
  curricularTextBoxes,
  writeToDatabaseInsightEnd,
  writeToDatabaseNewSession,
  initializeSession,
  writeToDatabasePoseStart,
  forceEventTypeCheck,
  bufferPoseDataWithEventCheck,
  startSmartAutoFlush,
  getCurrentOrgContext,
  writeToDatabaseConjectureWithCurrentOrg,
  writeToDatabaseConjectureDraftWithCurrentOrg,
  deleteFromDatabaseConjectureWithCurrentOrg,
  getConjectureListWithCurrentOrg,
  getCurricularListWithCurrentOrg,
  searchConjecturesByWordWithCurrentOrg,
  saveGameWithCurrentOrg,
  deleteFromDatabaseCurricularWithCurrentOrg,
  saveNarrativeDraftToFirebase,
  writeToDatabaseConjecture,
  writeToDatabaseConjectureDraft,
  deleteFromDatabaseConjecture,
  deleteFromDatabaseCurricular,
  getConjectureDataByUUID,
  getCurricularDataByUUID,
  getConjectureDataByAuthorID,
  getConjectureDataByPIN,
  getConjectureList,
  getCurricularList,
  searchConjecturesByWord,
  saveGame,
  getFromDatabaseByGame,
  getFromDatabaseByGameCSV,
  removeFromDatabaseByGame,
  checkGameAuthorization,
  getAuthorizedGameList,
  getGameNameByUUID,
  getLevelNameByUUID,
  findGameByLevelUUID,
  getGameNameByLevelUUID,
  findGameIdByName,
  findGameIdByNameAcrossOrgs,
  loadGameDialoguesFromFirebase,
  bufferPoseData,
  bufferPoseDataWithAutoFlush,
  flushFrameBuffer,
  endSession,
  getConjectureDataByUUIDWithCurrentOrg,
  getCurricularDataByUUIDWithCurrentOrg,
  getLevelNameByUUIDWithCurrentOrg,
  getGameNameByUUIDWithCurrentOrg,
  loadGameDialoguesFromFirebaseWithCurrentOrg,
  saveNarrativeDraftToFirebaseWithCurrentOrg,
} from '../../../firebase/database.js';
import { set, ref, get, remove, update } from 'firebase/database';
import { getAuth } from 'firebase/auth';

beforeEach(() => {
  setupDatabaseRtdbTestBeforeEach({ set, update, get, getCurrentUserContext, Curriculum });
  globalThis.getPlayGame.mockReturnValue(false);
});

describe('pose buffer helpers', () => {
  test('forceEventTypeCheck resolves false when buffer is empty', async () => {
    const out = await forceEventTypeCheck('g', 'u', 12, 'o');
    expect(out).toBe(false);
  });

  test('bufferPoseDataWithEventCheck returns boolean after pose primes eventType', async () => {
    await initializeSession('game-bpe', 12, 'uuid-bpe', 'org-bpe');
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', 'conj-bpe', 'game-bpe');
    await Promise.all(posePromises);

    const flushed = await bufferPoseDataWithEventCheck({ x: 1 }, 'game-bpe', 'uuid-bpe', 12, 'org-bpe');
    expect(typeof flushed).toBe('boolean');
  });

  test('startSmartAutoFlush returns an interval handle', () => {
    jest.useFakeTimers();
    const handle = startSmartAutoFlush('g1', 'u1', 'o1', { flushIntervalMs: 5000 });
    expect(handle).toBeDefined();
    clearInterval(handle);
    jest.useRealTimers();
  });
});

describe('bufferPoseDataWithAutoFlush hits size-based flush', () => {
  test('calls update after buffer crosses default max size', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await initializeSession('game-autoflush', 12, 'uuid-af', 'org-af');
    const posePromises = await writeToDatabasePoseStart('Pose 1-1', 'conj-af', 'game-autoflush');
    await Promise.all(posePromises);

    for (let i = 0; i < 50; i += 1) {
      await bufferPoseDataWithAutoFlush({ i }, 'game-autoflush', 'uuid-af', 12, 'org-af');
    }

    expect(update).toHaveBeenCalled();
    await endSession('game-autoflush', 'uuid-af', 12, 'org-af');
    logSpy.mockRestore();
  });
});

describe('flushFrameBuffer error handling', () => {
  test('returns false when update rejects', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await initializeSession('game-flush-err', 12, 'uuid-fe', 'org-fe');
    const posePromises = await writeToDatabasePoseStart('P1', 'conj-fe', 'game-flush-err');
    await Promise.all(posePromises);
    await bufferPoseData({ x: 1 }, 'game-flush-err', 'uuid-fe', 12, 'org-fe');

    update.mockRejectedValueOnce(new Error('write failed'));
    const ok = await flushFrameBuffer('game-flush-err', 'uuid-fe', 12, 'org-fe', 'P1');
    expect(ok).toBe(false);

    await endSession('game-flush-err', 'uuid-fe', 12, 'org-fe');
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  test('second concurrent flush returns early while first is in progress', async () => {
    await initializeSession('game-dup', 12, 'uuid-dup', 'org-dup');
    const posePromises = await writeToDatabasePoseStart('P1', 'c-dup', 'game-dup');
    await Promise.all(posePromises);
    await bufferPoseData({ a: 1 }, 'game-dup', 'uuid-dup', 12, 'org-dup');

    let finish;
    const stall = new Promise((resolve) => {
      finish = resolve;
    });
    update.mockImplementationOnce(() => stall);

    const first = flushFrameBuffer('game-dup', 'uuid-dup', 12, 'org-dup', 'P1');
    const second = flushFrameBuffer('game-dup', 'uuid-dup', 12, 'org-dup', 'P1');
    expect(await second).toBeUndefined();

    finish({});
    await first;

    await endSession('game-dup', 'uuid-dup', 12, 'org-dup');
  });
});

describe('bufferPoseDataWithAutoFlush without initialized session', () => {
  test('warns when buffer exceeds max before session init', async () => {
    const posePromises = await writeToDatabasePoseStart('PoseZ', 'conj-noinit', 'game-ni');
    await Promise.all(posePromises);
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 50; i += 1) {
      await bufferPoseDataWithAutoFlush({ n: i }, 'game-ni', 'uuid-noinit', 12, 'org-ni');
    }
    expect(w).toHaveBeenCalled();
    w.mockRestore();
  });
});

describe('startSmartAutoFlush interval', () => {
  test('runs scheduled callback without throwing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.useFakeTimers();
    const id = startSmartAutoFlush('g-t', 'u-t', 'org-t', {
      flushIntervalMs: 500,
      minBufferSize: 999,
    });
    await jest.advanceTimersByTimeAsync(500);
    clearInterval(id);
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  test('time-based flush runs when buffer meets minBufferSize and event type is stable', async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await initializeSession('g-saf', 12, 'u-saf', 'org-saf');
    const posePromises = await writeToDatabasePoseStart('StablePose', 'c-saf', 'g-saf');
    await Promise.all(posePromises);

    await bufferPoseData({ a: 1 }, 'g-saf', 'u-saf', 12, 'org-saf');
    await flushFrameBuffer('g-saf', 'u-saf', 12, 'org-saf', 'StablePose');

    await bufferPoseData({ b: 2 }, 'g-saf', 'u-saf', 12, 'org-saf');
    await bufferPoseData({ c: 3 }, 'g-saf', 'u-saf', 12, 'org-saf');

    const prevUpdates = update.mock.calls.length;
    const id = startSmartAutoFlush('g-saf', 'u-saf', 'org-saf', {
      flushIntervalMs: 400,
      minBufferSize: 2,
      maxBufferSize: 100,
    });
    await jest.advanceTimersByTimeAsync(400);
    clearInterval(id);
    jest.useRealTimers();

    expect(update.mock.calls.length).toBeGreaterThan(prevUpdates);
    warnSpy.mockRestore();
    await endSession('g-saf', 'u-saf', 12, 'org-saf');
  });
});

describe('promiseChecker alert branch (fresh module clock)', () => {
  test('alerts when rejections exceed threshold and cooldown elapsed', async () => {
    jest.resetModules();
    const t0 = 1_000_000_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    const mod = await import('../../../firebase/database.js');
    const { promiseChecker } = mod;
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    dateSpy.mockReturnValue(t0 + 25_000);

    const frameRate = 1;
    const rejects = [
      Promise.reject(new Error('a')),
      Promise.reject(new Error('b')),
      Promise.reject(new Error('c')),
      Promise.reject(new Error('d')),
    ];
    const mixed = [Promise.resolve(), Promise.resolve(), Promise.resolve(), ...rejects];

    await promiseChecker(frameRate, mixed);
    expect(al).toHaveBeenCalled();

    dateSpy.mockRestore();
    al.mockRestore();
  });
});
