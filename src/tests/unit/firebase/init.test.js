/**
 * init.test.js — unit tests for src/firebase/init.js
 *
 * init.js calls initializeApp(), getAuth(), getStorage(), and setPersistence()
 * at module-evaluation time (side effects). All four are covered by the mocks
 * in jest.setup.js / __mocks__/firebase/, so the module loads without hitting
 * the network or requiring real credentials.
 *
 * These tests assert that the module:
 *   1. Can be imported without throwing under the mocked environment.
 *   2. Exposes the expected named exports (app, auth, storage).
 */

import { app, auth, storage } from '../../../firebase/init.js';

describe('firebase/init — happy path', () => {
  test('exports a defined app object after initialization', () => {
    expect(app).toBeDefined();
    expect(app).not.toBeNull();
  });

  test('exports defined auth and storage objects', () => {
    expect(auth).toBeDefined();
    expect(storage).toBeDefined();
  });
});

// ─── Error paths ──────────────────────────────────────────────────────────────
// These tests use jest.isolateModules so that init.js runs fresh (with modified
// mock behaviour) instead of hitting the already-cached module from the import above.

describe('firebase/init — error paths', () => {
  test('throws (and logs) when initializeApp fails', () => {
    // Make the NEXT call to initializeApp throw
    require('firebase/app').initializeApp.mockImplementationOnce(() => {
      throw new Error('App init failed');
    });

    // init.js catches → logs → re-throws; the re-throw must propagate out
    expect(() => {
      jest.isolateModules(() => {
        require('../../../firebase/init.js');
      });
    }).toThrow('App init failed');
  });

  test('handles setPersistence rejection without crashing the module', async () => {
    require('firebase/auth').setPersistence.mockRejectedValueOnce(
      new Error('Persistence error')
    );

    let initExports;
    jest.isolateModules(() => {
      // Should not throw synchronously — error is handled in .catch()
      initExports = require('../../../firebase/init.js');
    });

    // app, auth, storage should still be exported correctly
    expect(initExports.app).toBeDefined();

    // Flush the microtask queue so the async .catch() handler on line 47 runs
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
