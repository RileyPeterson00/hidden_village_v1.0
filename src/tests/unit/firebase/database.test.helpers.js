/**
 * Shared helpers for `database.js` unit tests (`snapshotVal`, draft/publish localStorage seed, beforeEach).
 *
 * RTDB/auth overrides live in `database.jest.rtdb-mocks.js`. Specs are split across
 * `database.*.test.js` files in this folder (see each file’s header for scope).
 */

import { keysToPush } from '../../../firebase/database.js';

/** Minimal Firebase snapshot shape used across database tests */
export function snapshotVal(data) {
  return {
    exists: () => data != null,
    val: () => data,
    forEach: (cb) => {
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, v]) => {
          cb({ key, val: () => v });
        });
      }
    },
  };
}

/** Fills localStorage so writeToDatabaseConjecture / Draft / saveGame paths validate */
export function fillLocalStorageForDraftOrPublish() {
  keysToPush.forEach((key) => {
    localStorage.setItem(key, key === 'PIN' ? '1234' : `value-${key}`);
  });
  localStorage.setItem('start.json', '{}');
  localStorage.setItem('intermediate.json', '{}');
  localStorage.setItem('end.json', '{}');
  localStorage.setItem('Start Tolerance', '0.1');
  localStorage.setItem('Intermediate Tolerance', '0.1');
  localStorage.setItem('End Tolerance', '0.1');
  localStorage.setItem('isPublic', 'false');
}

/** Spy anchor clicks for getFromDatabaseByGame JSON download tests */
export function installDownloadClickSpy() {
  return jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

/** Standard beforeEach for RTDB-backed database tests that use coverage-style mocks */
export function setupDatabaseRtdbTestBeforeEach({
  set,
  update,
  get,
  getCurrentUserContext,
  Curriculum,
}) {
  jest.clearAllMocks();
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  get.mockReset();
  getCurrentUserContext.mockReset();
  getCurrentUserContext.mockImplementation(() =>
    Promise.resolve({ orgId: 'org-cov', role: 'Teacher' })
  );
  if (typeof globalThis.getPlayGame?.mockReturnValue === 'function') {
    globalThis.getPlayGame.mockReturnValue(false);
  }
  localStorage.clear();
  Curriculum.getCurrentConjectures.mockReturnValue([{ UUID: 'level-uuid-1' }]);
}
