/**
 * database.js — exports, session writes, org guards
 *
 * Editor constants, insight/new-session, getCurrentOrgContext, wrapper early exits, curricular delete with org.
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

describe('exported constants', () => {
  test('keysToPush lists expected editor keys', () => {
    expect(keysToPush).toContain('Conjecture Name');
    expect(keysToPush).toContain('MCQ Question');
  });

  test('curricularTextBoxes lists curricular editor fields', () => {
    expect(curricularTextBoxes).toContain('CurricularName');
    expect(curricularTextBoxes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('writeToDatabaseInsightEnd', () => {
  test('returns without Firebase when gameId is falsy', async () => {
    await writeToDatabaseInsightEnd('');
    await writeToDatabaseInsightEnd(null);
    expect(set).not.toHaveBeenCalled();
  });
});

describe('writeToDatabaseNewSession', () => {
  test('returns set promises with paths under _GameData for curricular id and session root', async () => {
    const promises = await writeToDatabaseNewSession('curr-id-1', 'game-name-x', 'Student');
    expect(Array.isArray(promises)).toBe(true);
    await Promise.all(promises);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.includes('_GameData/game-name-x/CurricularID'))).toBe(true);
    expect(paths.some((p) => p.includes('_GameData/game-name-x/') && p.includes('/GameStartGMT'))).toBe(true);
    expect(set).toHaveBeenCalled();
  });
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

describe('getCurrentOrgContext', () => {
  test('returns org from getCurrentUserContext when mocked', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: 'org-ctx', role: 'Admin' });
    const ctx = await getCurrentOrgContext();
    expect(ctx.orgId).toBe('org-ctx');
  });
});

describe('org wrapper early exits', () => {
  test('writeToDatabaseConjectureWithCurrentOrg alerts when no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await writeToDatabaseConjectureWithCurrentOrg('uuid-1');
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('deleteFromDatabaseConjectureWithCurrentOrg alerts when no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    await deleteFromDatabaseConjectureWithCurrentOrg('uuid-1');
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('getConjectureListWithCurrentOrg returns [] when no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const logSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const list = await getConjectureListWithCurrentOrg(true);
    expect(list).toEqual([]);
    logSpy.mockRestore();
  });

  test('saveGameWithCurrentOrg returns false when context has no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await saveGameWithCurrentOrg(null, false);
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('writeToDatabaseConjectureDraftWithCurrentOrg returns false when user has no org', async () => {
    localStorage.removeItem('_isFromOtherOrg');
    localStorage.removeItem('_sourceOrgId');
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await writeToDatabaseConjectureDraftWithCurrentOrg('draft-no-org');
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('writeToDatabaseConjectureDraftWithCurrentOrg uses _sourceOrgId when level is from other org', async () => {
    localStorage.setItem('_isFromOtherOrg', 'true');
    localStorage.setItem('_sourceOrgId', 'org-draft-src');
    fillLocalStorageForDraftOrPublish();
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraftWithCurrentOrg('draft-ext-1');
    expect(ok).toBe(true);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.includes('orgs/org-draft-src/levels/draft-ext-1'))).toBe(true);
    al.mockRestore();
  });

  test('getCurricularListWithCurrentOrg returns [] when user has no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const list = await getCurricularListWithCurrentOrg(false);
    expect(list).toEqual([]);
    w.mockRestore();
  });

  test('searchConjecturesByWordWithCurrentOrg returns [] when user has no org', async () => {
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await searchConjecturesByWordWithCurrentOrg('kw');
    expect(res).toEqual([]);
    w.mockRestore();
  });
});

describe('deleteFromDatabaseCurricularWithCurrentOrg', () => {
  test('uses source org from localStorage when Game_isFromOtherOrg', async () => {
    localStorage.setItem('Game_isFromOtherOrg', 'true');
    localStorage.setItem('Game_sourceOrgId', 'org-other');

    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    get.mockResolvedValue(snapshotVal({}));

    await deleteFromDatabaseCurricularWithCurrentOrg('game-del-1');

    const removePaths = remove.mock.calls.map((c) => c[0]?.path);
    expect(removePaths.some((p) => p === 'orgs/org-other/games/game-del-1')).toBe(true);
    al.mockRestore();
  });

  test('alerts and returns false when user has no org and game is local', async () => {
    localStorage.removeItem('Game_isFromOtherOrg');
    getCurrentUserContext.mockResolvedValueOnce({ orgId: null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await deleteFromDatabaseCurricularWithCurrentOrg('game-x');
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });
});

describe('getCurrentOrgContext error handling', () => {
  test('returns null orgId when getCurrentUserContext throws', async () => {
    getCurrentUserContext.mockRejectedValueOnce(new Error('network'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = await getCurrentOrgContext();
    expect(ctx.orgId).toBeNull();
    err.mockRestore();
  });
});

/**
 * Must stay last in this file: uses jest.resetModules() + dynamic import of database.js.
 */
describe('getCurrentOrgContext malformed userDatabase module', () => {
  test('returns null orgId when getCurrentUserContext is not exported', async () => {
    jest.resetModules();
    jest.doMock('../../../firebase/userDatabase.js', () => ({}));
    jest.doMock('../../../components/CurricularModule/CurricularModule.js', () => ({
      Curriculum: {
        CurrentConjectures: [],
        CurrentUUID: null,
        getCurrentConjectures: jest.fn(() => []),
        setCurrentUUID: jest.fn(),
      },
    }));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getCurrentOrgContext: getCtx } = await import('../../../firebase/database.js');
    const ctx = await getCtx();
    expect(ctx).toEqual({ orgId: null, role: null });
    expect(console.error).toHaveBeenCalled();
    err.mockRestore();
  });
});
