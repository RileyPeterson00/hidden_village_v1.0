/**
 * userSettings.test.js — unit tests for src/firebase/userSettings.js
 *
 * userSettings.js exports two async functions:
 *   - setUserSettings(settings)  — writes Users/{uid}/settings via RTDB set()
 *   - getUserSettings()          — reads Users/{uid}/settings via RTDB get()
 *
 * Both functions call ensureAuth() + waitForAuthReady() internally.
 * The __mocks__/firebase/auth.js mock makes onAuthStateChanged immediately
 * invoke its callback with FIXTURE_USER, so waitForAuthReady resolves in the
 * same tick without needing fake timers.
 *
 * Deferred scope (not covered here):
 *   - "no signed-in user" path: requires jest.isolateModules() to reset the
 *     module-level `userId`/`authInitialized` singletons between tests;
 *     left for a follow-up ticket given the LOW priority of this file.
 */

import { setUserSettings, getUserSettings } from '../../../firebase/userSettings.js';
import { set, get } from 'firebase/database';

beforeEach(() => {
  jest.clearAllMocks();
  set.mockResolvedValue(undefined);
});

describe('setUserSettings', () => {
  test('calls set() exactly once and returns true for an authenticated user', async () => {
    const settings = { theme: 'dark', language: 'en' };
    const result = await setUserSettings(settings);

    expect(set).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  test('returns false and swallows error when Firebase set() rejects', async () => {
    set.mockRejectedValueOnce(new Error('Write permission denied'));
    const result = await setUserSettings({ theme: 'dark' });
    expect(result).toBe(false);
  });
});

describe('getUserSettings', () => {
  test('returns the snapshot value when settings exist in the database', async () => {
    const mockSettings = { theme: 'light', volume: 50 };
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => mockSettings,
      key: 'settings',
    });

    const result = await getUserSettings();
    expect(result).toEqual(mockSettings);
  });

  test('returns null when snapshot does not exist (exists() → false branch)', async () => {
    get.mockResolvedValueOnce({
      exists: () => false,
      val: () => null,
      key: 'settings',
    });

    const result = await getUserSettings();
    expect(result).toBeNull();
  });

  test('returns null and swallows error when Firebase get() rejects', async () => {
    get.mockRejectedValueOnce(new Error('Read permission denied'));
    const result = await getUserSettings();
    expect(result).toBeNull();
  });
});

describe('waitForAuthReady — user-arrives path', () => {
  test('setUserSettings succeeds when user arrives via onAuthStateChanged inside waitForAuthReady', async () => {
    jest.useFakeTimers(); // prevents the 3 000 ms setTimeout from hanging

    const authMock = require('firebase/auth');
    const savedImpl = authMock.onAuthStateChanged.getMockImplementation();

    // First call (ensureAuth): no callback → userId stays null
    authMock.onAuthStateChanged.mockImplementationOnce(() => jest.fn());

    // Second call (waitForAuthReady): fire the callback as a microtask AFTER
    // `const unsubscribe = onAuthStateChanged(...)` finishes assigning.
    // Firing synchronously would hit the TDZ on `unsubscribe` and reject the Promise.
    authMock.onAuthStateChanged.mockImplementationOnce((auth, cb) => {
      Promise.resolve().then(() => cb({ uid: '12345', displayName: 'Test User' }));
      return jest.fn(); // unsubscribe
    });

    let isolatedSetUserSettings;
    jest.isolateModules(() => {
      ({ setUserSettings: isolatedSetUserSettings } =
        require('../../../firebase/userSettings.js'));
    });

    const result = await isolatedSetUserSettings({ theme: 'dark' });
    expect(result).toBe(true);

    authMock.onAuthStateChanged.mockImplementation(savedImpl);
    jest.useRealTimers();
  });
});

describe('waitForAuthReady — timeout fallback', () => {
  test('setUserSettings returns false when no user arrives within the timeout', async () => {
    jest.useFakeTimers();

    const authMock = require('firebase/auth');
    // Save current implementation so we can restore it after the test
    const savedImpl = authMock.onAuthStateChanged.getMockImplementation();
    // Override: never call the auth callback → userId stays null
    authMock.onAuthStateChanged.mockImplementation(() => jest.fn());

    let isolatedSetUserSettings;
    jest.isolateModules(() => {
      ({ setUserSettings: isolatedSetUserSettings } =
        require('../../../firebase/userSettings.js'));
    });

    const resultPromise = isolatedSetUserSettings({ theme: 'dark' });
    await jest.advanceTimersByTimeAsync(3001);

    const result = await resultPromise;
    expect(result).toBe(false);

    // Restore the original auth mock so later tests are unaffected
    authMock.onAuthStateChanged.mockImplementation(savedImpl);
    jest.useRealTimers();
  });
});
