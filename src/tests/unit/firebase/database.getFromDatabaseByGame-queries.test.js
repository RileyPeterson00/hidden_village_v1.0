/**
 * database.js — getFromDatabaseByGame and org resolution
 *
 * Context orgId fallback, JSON download paths for event/pose exports.
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

describe('getFromDatabaseByGame orgId resolution', () => {
  test('loads org from getCurrentOrgContext when orgId argument omitted', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getCurrentUserContext.mockResolvedValue({ orgId: 'ctx-org', role: 'Teacher' });
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p.startsWith('_GameData')) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      return Promise.resolve(snapshotVal(null));
    });

    const out = await getFromDatabaseByGame('lbl', 'game-ctx', '2024-01-01', '2024-01-31', null);
    expect(out).toBeNull();
    expect(al).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    al.mockRestore();
  });
});

describe('getFromDatabaseByGame download paths', () => {
  function installDownloadMocks() {
    return jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  }

  test('triggers JSON downloads when event and pose data load', async () => {
    const clickSpy = installDownloadMocks();
    const silencer = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSilencer = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const gameId = 'g70down';
    const orgId = 'org-down';
    const dateKey = '2024-06-01';
    const user = 'u1';
    const eventTree = { [dateKey]: { [user]: { deviceSlugA: { loginX: {} } } } };
    const poseTree = { deviceSlugA: { loginY: { sess: { p: 1 } } } };

    get.mockImplementation((arg) => {
      if (arg && arg._query) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      const p = arg?.path || '';
      if (p === `_GameData/${gameId}`) {
        return Promise.resolve(snapshotVal(eventTree));
      }
      if (p === 'orgs') {
        return Promise.resolve({ exists: () => false });
      }
      if (p.startsWith('_PoseData/')) {
        return Promise.resolve(snapshotVal(poseTree));
      }
      return Promise.resolve({ exists: () => false });
    });

    await getFromDatabaseByGame('GameLBL', gameId, dateKey, dateKey, orgId, 'ALL');
    expect(clickSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    clickSpy.mockRestore();
    silencer.mockRestore();
    warnSilencer.mockRestore();
  });

  test('downloads event log only when pose payload is missing', async () => {
    const clickSpy = installDownloadMocks();
    const silencer = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSilencer = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const gameId = 'g71evt';
    const orgId = 'org-evt';
    const dateKey = '2024-06-02';
    const eventTree = { [dateKey]: { u2: { devB: {} } } };

    get.mockImplementation((arg) => {
      if (arg && arg._query) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      const p = arg?.path || '';
      if (p === `_GameData/${gameId}`) {
        return Promise.resolve(snapshotVal(eventTree));
      }
      if (p === 'orgs') {
        return Promise.resolve({ exists: () => false });
      }
      if (p.startsWith('_PoseData/')) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      return Promise.resolve({ exists: () => false });
    });

    await getFromDatabaseByGame('EvtOnly', gameId, dateKey, dateKey, orgId, 'ALL');
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    silencer.mockRestore();
    warnSilencer.mockRestore();
  });

  test('applies selectedUser filter when not ALL', async () => {
    const clickSpy = installDownloadMocks();
    const silencer = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSilencer = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSilencer = jest.spyOn(console, 'error').mockImplementation(() => {});

    const gameId = 'g72filt';
    const orgId = 'org-f';
    const dateKey = '2024-06-03';
    const eventTree = { [dateKey]: { alice: { d: {} }, bob: { d: {} } } };
    const poseTree = { d: { l: { s: { x: 1 } } } };

    get.mockImplementation((arg) => {
      if (arg && arg._query) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      const p = arg?.path || '';
      if (p === `_GameData/${gameId}`) {
        return Promise.resolve(snapshotVal(eventTree));
      }
      if (p === 'orgs') {
        return Promise.resolve({ exists: () => false });
      }
      if (p.startsWith('_PoseData/')) {
        return Promise.resolve(snapshotVal(poseTree));
      }
      return Promise.resolve({ exists: () => false });
    });

    await getFromDatabaseByGame('FiltGame', gameId, dateKey, dateKey, orgId, 'alice');
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    silencer.mockRestore();
    warnSilencer.mockRestore();
    errSilencer.mockRestore();
  });
});
