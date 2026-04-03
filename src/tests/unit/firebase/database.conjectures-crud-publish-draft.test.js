/**
 * database.js — conjectures CRUD, publish, draft, autofill
 *
 * Level delete, conjecture autofill, publish/draft success, cross-org writes, student class assign, draft variants, errors.
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

describe('writeToDatabaseConjecture / draft early validation', () => {
  test('writeToDatabaseConjecture returns false when required localStorage fields empty', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await writeToDatabaseConjecture('conj-early', 'org-1');
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('writeToDatabaseConjectureDraft returns false when Conjecture Name missing', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const out = await writeToDatabaseConjectureDraft(null, 'org-1');
    expect(out).toBe(false);
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });
});

describe('deleteFromDatabaseConjecture / Curricular', () => {
  test('deleteFromDatabaseConjecture alerts when UUID missing', () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    deleteFromDatabaseConjecture('', 'org-1');
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });

  test('deleteFromDatabaseConjecture removes level after empty games lookup', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    get.mockResolvedValueOnce(snapshotVal(null));

    await deleteFromDatabaseConjecture('level-z', 'org-z');

    expect(remove.mock.calls[0][0].path).toBe('orgs/org-z/levels/level-z');
    al.mockRestore();
  });

  test('deleteFromDatabaseCurricular alerts when UUID missing', () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    deleteFromDatabaseCurricular('', 'org-1');
    expect(al).toHaveBeenCalled();
    al.mockRestore();
  });
});

describe('writeToDatabaseConjecture auto-fill branches', () => {
  test('fills Conjecture Statement from Intuition Description before validation', async () => {
    localStorage.setItem('Intuition Description', 'Statement From Intuition');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await writeToDatabaseConjecture('cid', 'org-fill');
    expect(localStorage.getItem('Conjecture Statement')).toBe('Statement From Intuition');
    expect(al).toHaveBeenCalled();
    logSpy.mockRestore();
    al.mockRestore();
  });
});

describe('writeToDatabaseConjectureDraft success path', () => {
  test('saves draft when all fields and pose JSON slots are present', async () => {
    fillLocalStorageForDraftOrPublish();
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await writeToDatabaseConjectureDraft('draft-uuid-99', 'org-draft');
    expect(ok).toBe(true);
    expect(set).toHaveBeenCalled();
    expect(al).toHaveBeenCalledWith('Draft saved.');
    al.mockRestore();
  });
});

describe('writeToDatabaseConjecture publish success path', () => {
  test('publishes when all required storage and pose JSON are present', async () => {
    fillLocalStorageForDraftOrPublish();
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await writeToDatabaseConjecture('pub-uuid-1', 'org-pub');
    expect(ok).toBe(true);
    expect(set.mock.calls.length).toBeGreaterThan(10);
    expect(al).toHaveBeenCalledWith('Conjecture successfully published to database.');
    al.mockRestore();
  });
});

describe('saveGame branch coverage', () => {
  test('rejects save when another game in the org already uses the name', async () => {
    localStorage.setItem('CurricularName', 'Taken');
    get.mockResolvedValueOnce(
      snapshotVal({
        other: { name: 'Taken', UUID: 'other-key' },
      })
    );
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await saveGame('my-uuid', false, 'org-dup');
    expect(ok).toBe(false);
    expect(al).toHaveBeenCalledWith(
      'This game name is already taken in this organization. Please choose a different name.'
    );
    al.mockRestore();
  });

  test('publish fails when curricular text boxes are incomplete', async () => {
    localStorage.setItem('CurricularName', 'Full Game');
    localStorage.setItem(curricularTextBoxes[0], 'ok');
    get.mockResolvedValue({ exists: () => false, val: () => null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await saveGame('pub-g', true, 'org-pub2');
    expect(ok).toBe(false);
    expect(al).toHaveBeenCalledWith(
      'One or more text fields are empty. Please fill out all required fields before publishing.'
    );
    al.mockRestore();
  });

  test('publish fails when there are no levels on the game', async () => {
    localStorage.setItem('CurricularName', 'Full Game');
    curricularTextBoxes.forEach((k) => localStorage.setItem(k, 'x'));
    Curriculum.getCurrentConjectures.mockReturnValue([]);
    get.mockResolvedValue({ exists: () => false, val: () => null });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await saveGame('pub-g2', true, 'org-pub3');
    expect(ok).toBe(false);
    expect(al).toHaveBeenCalledWith(
      'Please add at least one level (conjecture) to your game before publishing.'
    );
    al.mockRestore();
  });
});

describe('deleteFromDatabaseConjecture with curricular references', () => {
  test('updates games that reference the deleted level', async () => {
    get.mockResolvedValueOnce(
      snapshotVal({
        gk: { name: 'G', levelIds: ['keep-me', 'drop-me'] },
      })
    );
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    await deleteFromDatabaseConjecture('drop-me', 'org-del');

    expect(set).toHaveBeenCalled();
    const updatedPath = ref.mock.calls.find((c) => c[1].includes('/levelIds'))?.[1];
    expect(updatedPath).toContain('orgs/org-del/games');
    expect(remove).toHaveBeenCalled();
    al.mockRestore();
  });
});

describe('wrapper uses _isFromOtherOrg for conjecture delete', () => {
  test('deleteFromDatabaseConjectureWithCurrentOrg uses source org from localStorage', async () => {
    localStorage.setItem('_isFromOtherOrg', 'true');
    localStorage.setItem('_sourceOrgId', 'org-src');
    get.mockResolvedValueOnce(snapshotVal(null));
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});

    await deleteFromDatabaseConjectureWithCurrentOrg('lvl-src');

    expect(remove.mock.calls[0][0].path).toBe('orgs/org-src/levels/lvl-src');
    al.mockRestore();
  });
});

describe('writeToDatabaseConjectureWithCurrentOrg + saveGameWithCurrentOrg source org', () => {
  test('publishes conjecture to _sourceOrgId when level is from other org', async () => {
    localStorage.setItem('_isFromOtherOrg', 'true');
    localStorage.setItem('_sourceOrgId', 'org-remote');
    fillLocalStorageForDraftOrPublish();
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureWithCurrentOrg('conj-remote-1');

    expect(ok).toBe(true);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.includes('orgs/org-remote/levels/conj-remote-1'))).toBe(true);
    al.mockRestore();
  });

  test('saveGameWithCurrentOrg writes to Game_sourceOrgId when missing from local org', async () => {
    localStorage.setItem('CurricularName', 'Imported');
    localStorage.setItem('Game_isFromOtherOrg', 'true');
    localStorage.setItem('Game_sourceOrgId', 'org-save-ext');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p.endsWith('/Dialogues')) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      return Promise.resolve({ exists: () => false, val: () => null });
    });

    const ok = await saveGameWithCurrentOrg('game-ext-uuid', false);
    expect(ok).toBe(true);
    const path = ref.mock.calls.find(
      (c) => c[1].includes('orgs/org-save-ext/games') && c[1].includes('game-ext-uuid')
    )?.[1];
    expect(path).toBeDefined();
    al.mockRestore();
  });
});

describe('writeToDatabaseConjecture additional autofill', () => {
  test('fills Conjecture Statement from MCQ Question', async () => {
    localStorage.clear();
    localStorage.setItem('MCQ Question', 'The MCQ text');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await writeToDatabaseConjecture('c-mcq', 'org-mcq');
    expect(localStorage.getItem('Conjecture Statement')).toBe('The MCQ text');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('fills Conjecture Statement from Conjecture Description when other legacy fields empty', async () => {
    fillLocalStorageForDraftOrPublish();
    localStorage.removeItem('Conjecture Statement');
    localStorage.removeItem('Intuition Description');
    localStorage.removeItem('MCQ Question');
    localStorage.setItem('Conjecture Description', 'Legacy description body');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const ok = await writeToDatabaseConjecture('c-desc', 'org-mcq');
    expect(ok).toBe(true);
    expect(localStorage.getItem('Conjecture Statement')).toBe('Legacy description body');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('returns false when Firebase set fails during publish', async () => {
    fillLocalStorageForDraftOrPublish();
    set.mockRejectedValueOnce(new Error('network'));
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ok = await writeToDatabaseConjecture('pub-fail', 'org-pub');
    expect(ok).toBe(false);
    expect(al.mock.calls.some((c) => String(c[0]).includes('unexpected'))).toBe(true);
    errSpy.mockRestore();
    al.mockRestore();
  });

  test('assigns published level to student class when profile has currentClassId', async () => {
    fillLocalStorageForDraftOrPublish();
    getCurrentUserContext.mockResolvedValue({ orgId: 'org-pub', role: 'Student' });
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p.includes('currentClassId')) {
        return Promise.resolve({ exists: () => true, val: () => 'class-42' });
      }
      return Promise.resolve({ exists: () => false, val: () => null });
    });
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const ok = await writeToDatabaseConjecture('level-stu', 'org-pub');
    expect(ok).toBe(true);
    const paths = ref.mock.calls.map((c) => c[1]);
    expect(
      paths.some((p) => p.includes('orgs/org-pub/classes/class-42/assignedLevels/level-stu'))
    ).toBe(true);

    al.mockRestore();
  });
});

describe('writeToDatabaseConjectureDraft MCQ autofill + saveNarrative auth', () => {
  test('draft auto-fills statement from MCQ before pose save', async () => {
    localStorage.clear();
    keysToPush.forEach((key) => {
      if (
        key === 'Conjecture Statement' ||
        key === 'Intuition Description' ||
        key === 'MCQ Question'
      ) {
        return;
      }
      localStorage.setItem(key, key === 'Conjecture Name' ? 'DraftName' : `v-${key}`);
    });
    localStorage.setItem('MCQ Question', 'Draft MCQ body');
    localStorage.setItem('start.json', '{}');
    localStorage.setItem('intermediate.json', '{}');
    localStorage.setItem('end.json', '{}');
    localStorage.setItem('Start Tolerance', '0');
    localStorage.setItem('Intermediate Tolerance', '0');
    localStorage.setItem('End Tolerance', '0');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraft('draft-mcq', 'org-dm');
    expect(ok).toBe(true);
    expect(localStorage.getItem('Conjecture Statement')).toBe('Draft MCQ body');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('draft auto-fills statement from Intuition Description', async () => {
    localStorage.clear();
    keysToPush.forEach((key) => {
      if (
        key === 'Conjecture Statement' ||
        key === 'MCQ Question' ||
        key === 'Conjecture Description'
      ) {
        return;
      }
      localStorage.setItem(key, key === 'Conjecture Name' ? 'IntuitDraft' : `v-${key}`);
    });
    localStorage.setItem('Intuition Description', 'From intuition draft');
    localStorage.setItem('start.json', '{}');
    localStorage.setItem('intermediate.json', '{}');
    localStorage.setItem('end.json', '{}');
    localStorage.setItem('Start Tolerance', '0');
    localStorage.setItem('Intermediate Tolerance', '0');
    localStorage.setItem('End Tolerance', '0');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraft('draft-int', 'org-dm');
    expect(ok).toBe(true);
    expect(localStorage.getItem('Conjecture Statement')).toBe('From intuition draft');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('draft auto-fills statement from Conjecture Description', async () => {
    localStorage.clear();
    keysToPush.forEach((key) => {
      if (
        key === 'Conjecture Statement' ||
        key === 'Intuition Description' ||
        key === 'MCQ Question'
      ) {
        return;
      }
      localStorage.setItem(key, key === 'Conjecture Name' ? 'DescDraft' : `v-${key}`);
    });
    localStorage.setItem('Conjecture Description', 'Legacy desc draft');
    localStorage.setItem('start.json', '{}');
    localStorage.setItem('intermediate.json', '{}');
    localStorage.setItem('end.json', '{}');
    localStorage.setItem('Start Tolerance', '0');
    localStorage.setItem('Intermediate Tolerance', '0');
    localStorage.setItem('End Tolerance', '0');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraft('draft-legacy', 'org-dm');
    expect(ok).toBe(true);
    expect(localStorage.getItem('Conjecture Statement')).toBe('Legacy desc draft');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('draft back-fills MCQ and Conjecture Description from Statement alone', async () => {
    localStorage.clear();
    keysToPush.forEach((key) => {
      if (
        key === 'Intuition Description' ||
        key === 'MCQ Question' ||
        key === 'Conjecture Description'
      ) {
        return;
      }
      localStorage.setItem(key, key === 'Conjecture Name' ? 'SoloStmt' : `v-${key}`);
    });
    localStorage.setItem('Conjecture Statement', 'Only statement');
    localStorage.setItem('start.json', '{}');
    localStorage.setItem('intermediate.json', '{}');
    localStorage.setItem('end.json', '{}');
    localStorage.setItem('Start Tolerance', '0');
    localStorage.setItem('Intermediate Tolerance', '0');
    localStorage.setItem('End Tolerance', '0');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraft('draft-solo', 'org-dm');
    expect(ok).toBe(true);
    expect(localStorage.getItem('MCQ Question')).toBe('Only statement');
    expect(localStorage.getItem('Conjecture Description')).toBe('Only statement');
    logSpy.mockRestore();
    al.mockRestore();
  });

  test('draft returns false when Firebase set rejects', async () => {
    fillLocalStorageForDraftOrPublish();
    set.mockRejectedValueOnce(new Error('draft-net'));
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const ok = await writeToDatabaseConjectureDraft('draft-err', 'org-x');
    expect(ok).toBe(false);
    expect(al.mock.calls.some((c) => String(c[0]).toLowerCase().includes('draft'))).toBe(true);
    errSpy.mockRestore();
    al.mockRestore();
  });

  test('saveNarrativeDraftToFirebase throws when not authenticated', async () => {
    getAuth.mockReturnValueOnce({ currentUser: null });
    await expect(saveNarrativeDraftToFirebase('g', [], 'o')).rejects.toThrow(
      'User is not authenticated'
    );
  });
});

describe('error and catch branches', () => {
  test('getConjectureDataByUUID propagates get errors', async () => {
    get.mockRejectedValueOnce(new Error('rtdb-down'));
    await expect(getConjectureDataByUUID('id', 'org-e')).rejects.toThrow('rtdb-down');
  });

  test('deleteFromDatabaseConjecture shows error alert when remove fails', async () => {
    get.mockResolvedValueOnce(snapshotVal(null));
    remove.mockRejectedValueOnce(new Error('permission'));
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    await deleteFromDatabaseConjecture('lvl-err', 'org-er');
    expect(String(al.mock.calls[0][0])).toMatch(/error/i);
    al.mockRestore();
  });

  test('findGameIdByNameAcrossOrgs returns null on top-level failure', async () => {
    get.mockRejectedValueOnce(new Error('timeout'));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await findGameIdByNameAcrossOrgs('Name', 'org-x')).toBeNull();
    logSpy.mockRestore();
    err.mockRestore();
  });

  test('checkGameAuthorization propagates when org games get throws', async () => {
    get.mockRejectedValueOnce(new Error('rules'));
    await expect(checkGameAuthorization('G', 'org-z')).rejects.toThrow('rules');
  });

  test('getFromDatabaseByGameCSV rethrows on failure', async () => {
    get.mockRejectedValueOnce(new Error('csv-boom'));
    await expect(getFromDatabaseByGameCSV('a', 'b', 'c', 'd')).rejects.toThrow('csv-boom');
  });
});
