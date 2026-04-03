/**
 * database.js — WithCurrentOrg and public merges
 *
 * Merging public levels/games from other orgs, WithCurrentOrg loaders, cross-org level UUID resolution.
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

describe('getConjectureListWithCurrentOrg includePublicFromOtherOrgs', () => {
  test('merges public levels from other orgs when flag true', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return Promise.resolve(snapshotVal({ a: { UUID: 'local', isPublic: false } }));
      }
      if (p === 'orgs') {
        return Promise.resolve(
          snapshotVal({
            'org-cov': {},
            'org-other': {},
          })
        );
      }
      if (p === 'orgs/org-other/levels') {
        return Promise.resolve(
          snapshotVal({
            b: { UUID: 'pub1', isPublic: true },
          })
        );
      }
      return Promise.resolve(snapshotVal(null));
    });

    const merged = await getConjectureListWithCurrentOrg(true, true);
    const fromOther = merged.filter((x) => x._isFromOtherOrg);
    expect(fromOther.length).toBe(1);
    expect(fromOther[0]._sourceOrgId).toBe('org-other');
  });
});

describe('getCurricularListWithCurrentOrg includePublicFromOtherOrgs', () => {
  test('merges public games from other orgs', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/games') {
        return Promise.resolve(snapshotVal({ a: { name: 'Local' } }));
      }
      if (p === 'orgs') {
        return Promise.resolve(snapshotVal({ 'org-cov': {}, 'org-ext': {} }));
      }
      if (p === 'orgs/org-ext/games') {
        return Promise.resolve(snapshotVal({ b: { name: 'PubG', isPublic: true } }));
      }
      return Promise.resolve(snapshotVal(null));
    });

    const merged = await getCurricularListWithCurrentOrg(false, true);
    expect(merged.some((g) => g.name === 'PubG' && g._isFromOtherOrg)).toBe(true);
  });
});

describe('searchConjecturesByWordWithCurrentOrg', () => {
  test('extends results with public levels from other orgs when search cleared', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return Promise.resolve(snapshotVal({}));
      }
      if (p.includes('Search Words')) {
        return Promise.resolve(snapshotVal({}));
      }
      if (p === 'orgs') {
        return Promise.resolve(snapshotVal({ 'org-cov': {}, 'org-x': {} }));
      }
      if (p === 'orgs/org-x/levels') {
        return Promise.resolve(
          snapshotVal({
            z: { isPublic: true, UUID: 'ext', 'Search Words': {} },
          })
        );
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await searchConjecturesByWordWithCurrentOrg('');
    expect(res.some((x) => x._sourceOrgId === 'org-x')).toBe(true);
  });
});

describe('WithCurrentOrg data loaders', () => {
  test('getCurricularDataByUUIDWithCurrentOrg delegates with org from context', async () => {
    get.mockImplementation((r) => {
      if (r && r._query) {
        return Promise.resolve(snapshotVal({ gk: { UUID: 'cur-1', name: 'G1' } }));
      }
      return Promise.resolve(snapshotVal(null));
    });
    const data = await getCurricularDataByUUIDWithCurrentOrg('cur-1');
    expect(data).toBeTruthy();
  });

  test('getCurricularDataByUUIDWithCurrentOrg returns null when no org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getCurricularDataByUUIDWithCurrentOrg('x')).toBeNull();
    w.mockRestore();
  });

  test('getLevelNameByUUIDWithCurrentOrg returns UnknownLevel without org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getLevelNameByUUIDWithCurrentOrg('lid')).toBe('UnknownLevel');
    w.mockRestore();
  });

  test('getGameNameByUUIDWithCurrentOrg returns UnknownGame without org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getGameNameByUUIDWithCurrentOrg('gid')).toBe('UnknownGame');
    w.mockRestore();
  });

  test('loadGameDialoguesFromFirebaseWithCurrentOrg delegates', async () => {
    get.mockResolvedValueOnce({ exists: () => true, val: () => [{ id: 1 }] });
    const dlg = await loadGameDialoguesFromFirebaseWithCurrentOrg('g-dlg');
    expect(dlg).toEqual([{ id: 1 }]);
  });

  test('loadGameDialoguesFromFirebaseWithCurrentOrg returns [] without org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadGameDialoguesFromFirebaseWithCurrentOrg('g')).toEqual([]);
    w.mockRestore();
  });

  test('saveNarrativeDraftToFirebaseWithCurrentOrg alerts when user has no org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    await saveNarrativeDraftToFirebaseWithCurrentOrg('u', []);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });
});

describe('getConjectureDataByUUIDWithCurrentOrg cross-org search', () => {
  test('finds public level in another organization when missing locally', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return snapshotVal({ local: { UUID: 'other' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-cov': {}, 'org-ext': {} });
      }
      if (p === 'orgs/org-ext/levels') {
        return snapshotVal({
          z: { UUID: 'wanted', isPublic: true, Name: 'Remote' },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await getConjectureDataByUUIDWithCurrentOrg('wanted', true, false);
    expect(res).toBeTruthy();
    expect(res.wanted._isFromOtherOrg).toBe(true);
    expect(res.wanted._sourceOrgId).toBe('org-ext');
    logSpy.mockRestore();
  });

  test('skips other-org search when includePublic and forceLoadPrivate are false', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockResolvedValueOnce(snapshotVal({ a: { UUID: 'nope' } }));

    const res = await getConjectureDataByUUIDWithCurrentOrg('missing', false, false);
    expect(res).toBeNull();
    logSpy.mockRestore();
  });

  test('returns null from current org lookup when user has no org', async () => {
    getCurrentUserContext.mockImplementationOnce(() =>
      Promise.resolve({ orgId: null, role: null })
    );
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getConjectureDataByUUIDWithCurrentOrg('x')).toBeNull();
    w.mockRestore();
  });

  test('forceLoadPrivate returns private level from another org', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return snapshotVal({ local: { UUID: 'other' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-cov': {}, 'org-ext': {} });
      }
      if (p === 'orgs/org-ext/levels') {
        return snapshotVal({
          z: { UUID: 'priv-only', isPublic: false, Name: 'N' },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await getConjectureDataByUUIDWithCurrentOrg('priv-only', false, true);
    expect(res['priv-only']._isFromOtherOrg).toBe(true);
    logSpy.mockRestore();
  });

  test('does not return other-org level when private and forceLoadPrivate is false', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return snapshotVal({ local: { UUID: 'other' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-cov': {}, 'org-ext': {} });
      }
      if (p === 'orgs/org-ext/levels') {
        return snapshotVal({
          z: { UUID: 'priv-skip', isPublic: false, Name: 'N' },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await getConjectureDataByUUIDWithCurrentOrg('priv-skip', true, false);
    expect(res).toBeNull();
    logSpy.mockRestore();
  });

  test('handles error when listing organizations during cross-org lookup', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return snapshotVal({ a: { UUID: 'nope' } });
      }
      if (p === 'orgs') {
        return Promise.reject(new Error('orgs-offline'));
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await getConjectureDataByUUIDWithCurrentOrg('wanted', true, false);
    expect(res).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('logs final structure when current org returns a level with poses', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockResolvedValueOnce(
      snapshotVal({
        k1: {
          UUID: 'with-pose',
          Name: 'L',
          'Start Pose': { poseData: '{}' },
        },
      })
    );

    const res = await getConjectureDataByUUIDWithCurrentOrg('with-pose', false, false);
    expect(res).toBeTruthy();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('getConjectureListWithCurrentOrg try/catch for other orgs', () => {
  test('still returns local list when public-level fetch throws', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-cov/levels') {
        return snapshotVal({ a: { UUID: 'local-only' } });
      }
      if (p === 'orgs') {
        return Promise.reject(new Error('orgs-broken'));
      }
      return Promise.resolve(snapshotVal(null));
    });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const list = await getConjectureListWithCurrentOrg(true, true);
    expect(list.length).toBe(1);
    expect(list[0].UUID).toBe('local-only');
    err.mockRestore();
  });
});

describe('searchConjecturesByWordWithCurrentOrg keyword in other org', () => {
  test('includes public levels from other orgs when keyword matches Search Words', async () => {
    get.mockImplementation((r) => {
      if (r && r._query) {
        return Promise.resolve(
          snapshotVal({
            row1: { UUID: '1', 'Search Words': { gamma: 'gamma' } },
          })
        );
      }
      const p = r.path || '';
      if (p === 'orgs') {
        return snapshotVal({ 'org-cov': {}, 'org-t': {} });
      }
      if (p === 'orgs/org-t/levels') {
        return snapshotVal({
          ext: {
            isPublic: true,
            UUID: 'ext-1',
            'Search Words': { gamma: 'gamma' },
          },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });

    const res = await searchConjecturesByWordWithCurrentOrg('gamma');
    const fromOther = res.filter((x) => x._sourceOrgId === 'org-t');
    expect(fromOther.length).toBeGreaterThanOrEqual(1);
  });
});
