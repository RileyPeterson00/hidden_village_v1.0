/**
 * database.js — games, narrative draft, saveGame
 *
 * Narrative draft to RTDB, saveGame happy path and publish validation branches.
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

describe('saveNarrativeDraftToFirebase', () => {
  test('writes Dialogues and metadata under org game path', async () => {
    const dialogues = [{ line: 'hi' }];
    await saveNarrativeDraftToFirebase('game-nar-1', dialogues, 'org-nar');

    const paths = ref.mock.calls.map((c) => c[1]);
    expect(paths.some((p) => p.includes('orgs/org-nar/games/game-nar-1/Dialogues'))).toBe(true);
    expect(set).toHaveBeenCalled();
  });
});

describe('saveGame', () => {
  test('returns false when game name missing', async () => {
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const ok = await saveGame('uuid-save', false, 'org-save');
    expect(ok).toBe(false);
    expect(al).toHaveBeenCalledWith('Please enter a game name before saving.');
    al.mockRestore();
  });

  test('draft save succeeds when name unique and dialogues load empty', async () => {
    localStorage.setItem('CurricularName', ' Unique Game ');
    localStorage.setItem('CurricularAuthor', 'Auth');
    const al = jest.spyOn(window, 'alert').mockImplementation(() => {});
    get.mockImplementation((r) => {
      const p = r.path || '';
      if (p.endsWith('/Dialogues')) {
        return Promise.resolve({ exists: () => false, val: () => null });
      }
      return Promise.resolve({ exists: () => false, val: () => null });
    });

    const ok = await saveGame('draft-uuid-1', false, 'org-save');

    expect(ok).toBe(true);
    expect(set).toHaveBeenCalled();
    expect(Curriculum.setCurrentUUID).toHaveBeenCalledWith('draft-uuid-1');
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
