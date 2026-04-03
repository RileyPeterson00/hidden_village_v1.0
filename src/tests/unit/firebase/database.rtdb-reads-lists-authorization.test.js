/**
 * database.js — reads, lists, search, game resolution
 *
 * UUID queries, lists, search, loadGameDialogues, admin CSV/remove helpers, authorization, findGame*.
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

describe('reads: UUID / list / search', () => {
  test('getConjectureDataByUUID returns keyed object when level UUID matches', async () => {
    const levels = {
      keyA: { UUID: 'find-me', Name: 'L1' },
    };
    get.mockResolvedValueOnce(snapshotVal(levels));

    const res = await getConjectureDataByUUID('find-me', 'org-l');
    expect(res).toEqual({ 'find-me': levels.keyA });
  });

  test('getCurricularDataByUUID returns null when parameters missing', async () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getCurricularDataByUUID('', 'org')).toBeNull();
    expect(await getCurricularDataByUUID('id', '')).toBeNull();
    w.mockRestore();
  });

  test('getCurricularDataByUUID returns val when query exists', async () => {
    const data = { g1: { name: 'G', UUID: 'u1' } };
    get.mockResolvedValueOnce(snapshotVal(data));

    const res = await getCurricularDataByUUID('u1', 'org-g');
    expect(res).toEqual(data);
  });

  test('getConjectureDataByAuthorID collects forEach results', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        a: { AuthorID: 'auth1', name: 'one' },
      })
    );

    const rows = await getConjectureDataByAuthorID('auth1');
    expect(rows).toEqual([{ AuthorID: 'auth1', name: 'one' }]);
  });

  test('getConjectureDataByPIN returns null when snapshot empty', async () => {
    get.mockResolvedValueOnce(snapshotVal(null));
    expect(await getConjectureDataByPIN('1234')).toBeNull();
  });

  test('getConjectureList maps forEach when data exists', async () => {
    get.mockResolvedValueOnce(snapshotVal({ k1: { UUID: '1' } }));
    const list = await getConjectureList(true, 'org-c');
    expect(list).toEqual([{ UUID: '1' }]);
  });

  test('getCurricularList maps games when data exists', async () => {
    get.mockResolvedValueOnce(snapshotVal({ k1: { name: 'Game' } }));
    const list = await getCurricularList(false, 'org-g2');
    expect(list).toEqual([{ name: 'Game' }]);
  });

  test('searchConjecturesByWord returns all when search cleared', async () => {
    const one = { 'Search Words': { hello: 'hello' }, UUID: 'u' };
    get.mockImplementation((r) => {
      if (r && r._query) {
        return Promise.resolve(snapshotVal({ a: one }));
      }
      return Promise.resolve(snapshotVal(null));
    });
    const found = await searchConjecturesByWord('   ', 'org-s');
    expect(found).toEqual([one]);
  });

  test('searchConjecturesByWord returns [] on get error', async () => {
    get.mockRejectedValueOnce(new Error('network'));
    const e = jest.spyOn(console, 'error').mockImplementation(() => {});
    const found = await searchConjecturesByWord('x', 'org-s');
    expect(found).toEqual([]);
    e.mockRestore();
  });
});

describe('exports and admin queries', () => {
  test('getFromDatabaseByGame alerts when no event data in range', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockResolvedValueOnce({ exists: () => false, val: () => null });

    const out = await getFromDatabaseByGame('lbl', 'gid', '2024-01-01', '2024-01-31', 'org-exp');

    expect(out).toBeNull();
    expect(al).toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    al.mockRestore();
  });

  test('getFromDatabaseByGameCSV returns null when snapshot missing', async () => {
    get.mockResolvedValueOnce({ exists: () => false, val: () => null });
    const csv = await getFromDatabaseByGameCSV('g', 'gid', 'a', 'b');
    expect(csv).toBeNull();
    expect(convertJsonToCsv).not.toHaveBeenCalled();
  });

  test('getFromDatabaseByGameCSV calls convertJsonToCsv when data exists', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ '2024-01-15': { user1: { UserId: 'u' } } }),
    });
    const csv = await getFromDatabaseByGameCSV('My Game', 'gid', '2024-01-01', '2024-01-31');
    expect(csv).toBe('csv-mock-result');
    expect(convertJsonToCsv).toHaveBeenCalled();
  });

  test('removeFromDatabaseByGame returns no data when snapshot empty', async () => {
    get.mockResolvedValueOnce({ exists: () => false, val: () => null });
    const res = await removeFromDatabaseByGame('pose-game', 'a', 'b');
    expect(res.success).toBe(false);
  });

  test('checkGameAuthorization returns true when game name in org', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        g1: { name: 'Alpha', UUID: 'u1' },
      })
    );

    expect(await checkGameAuthorization('Alpha', 'org-auth')).toBe(true);
  });

  test('getAuthorizedGameList returns names from org', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-list/games') {
        return Promise.resolve(
          snapshotVal({
            x: { name: 'One' },
          })
        );
      }
      if (p === 'orgs') {
        return Promise.resolve(snapshotVal(null));
      }
      return Promise.resolve(snapshotVal(null));
    });

    const list = await getAuthorizedGameList('org-list');
    expect(list).toContain('One');
  });

  test('getGameNameByUUID uses getCurricularDataByUUID', async () => {
    get.mockResolvedValueOnce(snapshotVal({ gk: { name: 'Nice', UUID: 'uuid-g' } }));
    const name = await getGameNameByUUID('uuid-g', 'org-n');
    expect(name).toBe('Nice');
  });

  test('getGameNameByUUID returns UnknownGame when gameID missing', async () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getGameNameByUUID('', 'org')).toBe('UnknownGame');
    w.mockRestore();
  });

  test('getLevelNameByUUID reads Name from conjecture payload', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        l1: { UUID: 'lvl', Name: 'Level A' },
      })
    );
    expect(await getLevelNameByUUID('lvl', 'org-lvl')).toBe('Level A');
  });

  test('findGameByLevelUUID returns game when levelIds contains uuid', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        g1: { name: 'G', levelIds: ['abc'] },
      })
    );
    const game = await findGameByLevelUUID('abc', 'org-f');
    expect(game.name).toBe('G');
  });

  test('getGameNameByLevelUUID returns game name', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        g1: { name: 'FromLevel', levelIds: ['lev-1'] },
      })
    );
    expect(await getGameNameByLevelUUID('lev-1', 'org-f2')).toBe('FromLevel');
  });

  test('findGameIdByName returns UUID when name substring matches', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        k: { name: 'My Special Game', UUID: 'game-uid-99' },
      })
    );
    expect(await findGameIdByName('Special', 'org-f3')).toBe('game-uid-99');
  });

  test('findGameIdByNameAcrossOrgs returns null when name missing', async () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await findGameIdByNameAcrossOrgs('', 'org')).toBeNull();
    w.mockRestore();
  });

  test('findGameIdByNameAcrossOrgs finds in current org', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockResolvedValueOnce(
      snapshotVal({
        k: { name: 'TargetGame', UUID: 'gid-here' },
      })
    );

    const res = await findGameIdByNameAcrossOrgs('TargetGame', 'org-cur');
    expect(res).toEqual({ gameId: 'gid-here', orgId: 'org-cur' });
    logSpy.mockRestore();
  });
});

describe('loadGameDialoguesFromFirebase branches', () => {
  test('returns empty array when snapshot does not exist', async () => {
    get.mockResolvedValueOnce({ exists: () => false, val: () => null });
    const out = await loadGameDialoguesFromFirebase('g-empty', 'org-o');
    expect(out).toEqual([]);
  });
});

describe('getConjectureDataByUUID edge branches', () => {
  test('returns null when no level matches the UUID', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockResolvedValueOnce(
      snapshotVal({
        k1: { UUID: 'other' },
      })
    );
    expect(await getConjectureDataByUUID('missing-uuid', 'org-x')).toBeNull();
    logSpy.mockRestore();
  });

  test('returns null when organization has no levels', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockResolvedValueOnce(snapshotVal(null));
    expect(await getConjectureDataByUUID('any', 'org-empty')).toBeNull();
    logSpy.mockRestore();
  });
});

describe('getCurricularDataByUUID error branches', () => {
  test('uses console.debug when Firebase suggests an index', async () => {
    const dbg = jest.spyOn(console, 'debug').mockImplementation(() => {});
    get.mockRejectedValueOnce(new Error('index not defined'));
    expect(await getCurricularDataByUUID('id', 'org-i')).toBeNull();
    expect(dbg).toHaveBeenCalled();
    dbg.mockRestore();
  });

  test('logs console.error for non-index query failures', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    get.mockRejectedValueOnce(new Error('permission denied'));
    expect(await getCurricularDataByUUID('id', 'org-e')).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('getConjectureDataByPIN', () => {
  test('returns array of matches when snapshot exists', async () => {
    get.mockImplementation((r) => {
      if (r && r._query) {
        return Promise.resolve(
          snapshotVal({
            row: { PIN: '7788', AuthorID: 'a1' },
          })
        );
      }
      return Promise.resolve(snapshotVal(null));
    });
    const rows = await getConjectureDataByPIN('7788');
    expect(rows).toEqual([{ PIN: '7788', AuthorID: 'a1' }]);
  });
});

describe('searchConjecturesByWord keyword match branch', () => {
  test('returns only entries whose Search Words contain the term', async () => {
    const rowA = { UUID: '1', 'Search Words': { alpha: 'alpha' } };
    const rowB = { UUID: '2', 'Search Words': { beta: 'beta' } };
    get.mockImplementation((r) => {
      if (r && r._query) {
        return Promise.resolve(snapshotVal({ a: rowA, b: rowB }));
      }
      return Promise.resolve(snapshotVal(null));
    });
    const out = await searchConjecturesByWord('Beta', 'org-sw');
    expect(out).toEqual([rowB]);
  });
});

describe('list queries when empty', () => {
  test('getConjectureList returns null when snapshot empty', async () => {
    get.mockResolvedValueOnce(snapshotVal(null));
    expect(await getConjectureList(true, 'org-z')).toBeNull();
  });

  test('getCurricularList returns null when snapshot empty', async () => {
    get.mockResolvedValueOnce(snapshotVal(null));
    expect(await getCurricularList(false, 'org-z2')).toBeNull();
  });
});

describe('findGameIdByName guards', () => {
  test('returns null when name is falsy', async () => {
    expect(await findGameIdByName('', 'org')).toBeNull();
  });
});

describe('findGameByLevelUUID', () => {
  test('returns null when levelUUID is falsy', async () => {
    expect(await findGameByLevelUUID('', 'org')).toBeNull();
  });
});

describe('getGameNameByUUID / getLevelNameByUUID param branches', () => {
  test('getGameNameByUUID returns UnknownGame when orgId missing', async () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getGameNameByUUID('gid', '')).toBe('UnknownGame');
    w.mockRestore();
  });

  test('getLevelNameByUUID returns UnknownLevel when orgId missing', async () => {
    const w = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getLevelNameByUUID('lid', '')).toBe('UnknownLevel');
    w.mockRestore();
  });

  test('getLevelNameByUUID prefers CurricularName when Name absent', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        k: { UUID: 'u2', CurricularName: 'Curric Title' },
      })
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await getLevelNameByUUID('u2', 'org-cn')).toBe('Curric Title');
    logSpy.mockRestore();
  });

  test('getLevelNameByUUID reads Conjecture Name inside Text Boxes', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        k: {
          UUID: 'u3',
          'Text Boxes': { 'Conjecture Name': 'TB Name' },
        },
      })
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await getLevelNameByUUID('u3', 'org-tb')).toBe('TB Name');
    logSpy.mockRestore();
  });

  test('getGameNameByUUID falls back to CurricularName field', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        gk: { UUID: 'ug', CurricularName: 'Fallback Curric' },
      })
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await getGameNameByUUID('ug', 'org-fb')).toBe('Fallback Curric');
    logSpy.mockRestore();
  });
});

describe('checkGameAuthorization public-game branch', () => {
  test('returns true when game is public in another organization', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-home/games') {
        return snapshotVal({ x: { name: 'LocalOnly', UUID: '1' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-home': {}, 'org-ext': {} });
      }
      if (p === 'orgs/org-ext/games') {
        return snapshotVal({
          y: { name: 'SharedTitle', isPublic: true, UUID: 'pub-g' },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });
    expect(await checkGameAuthorization('SharedTitle', 'org-home')).toBe(true);
  });

  test('returns null when game not found anywhere', async () => {
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-n/games') {
        return snapshotVal({ a: { name: 'A', UUID: '1' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-n': {} });
      }
      return Promise.resolve(snapshotVal(null));
    });
    expect(await checkGameAuthorization('Nope', 'org-n')).toBeNull();
  });
});

describe('findGameIdByNameAcrossOrgs other-organization branch', () => {
  test('finds public game in a different org when missing in current org', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p === 'orgs/org-a/games') {
        return snapshotVal({ k: { name: 'Wrong', UUID: 'w' } });
      }
      if (p === 'orgs') {
        return snapshotVal({ 'org-a': {}, 'org-b': {} });
      }
      if (p === 'orgs/org-b/games') {
        return snapshotVal({
          z: { name: 'UniquePublic', UUID: 'found-id', isPublic: true },
        });
      }
      return Promise.resolve(snapshotVal(null));
    });
    const res = await findGameIdByNameAcrossOrgs('UniquePublic', 'org-a');
    expect(res).toEqual({ gameId: 'found-id', orgId: 'org-b' });
    logSpy.mockRestore();
  });
});

describe('removeFromDatabaseByGame happy path', () => {
  test('updates remove when query returns keys in range', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ k1: {} }),
      forEach: (cb) => {
        cb({ key: 'k1', val: () => ({}) });
      },
    });
    remove.mockResolvedValue(undefined);
    const res = await removeFromDatabaseByGame('poseSel', '2024-01-01', '2024-12-31');
    expect(res.success).toBe(true);
    expect(remove).toHaveBeenCalled();
  });
});

describe('getAuthorizedGameList error path', () => {
  test('throws when initial games read fails', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getAuthorizedGameList('org-err')).rejects.toThrow('offline');
    err.mockRestore();
  });
});
