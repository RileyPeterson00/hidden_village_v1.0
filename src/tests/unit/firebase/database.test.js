/**
 * Unit Tests: Firebase Database Write Operations
 *
 * Tests writeToDatabasePoseMatch and writeToDatabasePoseStart for:
 * - Correct ref() paths
 * - Correct set() data
 * - Error handling (network errors, rejections)
 *
 * All Firebase SDK calls are mocked via jest.config.js moduleNameMapper.
 */

// Prevent auth callback from firing (avoids undefined module vars in path)
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(() => jest.fn()),
  setPersistence: jest.fn(() => Promise.resolve()),
  browserSessionPersistence: { _name: 'SESSION' },
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
  signOut: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../components/CurricularModule/CurricularModule.js', () => ({
  Curriculum: {
    CurrentConjectures: [],
    CurrentUUID: null,
    getCurrentConjectures: jest.fn(() => []),
    setCurrentUUID: jest.fn(),
  },
}));

import {
  writeToDatabasePoseMatch,
  writeToDatabasePoseStart,
} from '../../../firebase/database.js';
import { set, ref } from 'firebase/database';

beforeEach(() => {
  jest.clearAllMocks();
  set.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// writeToDatabasePoseMatch
// ---------------------------------------------------------------------------
describe('writeToDatabasePoseMatch', () => {
  test('calls ref() with path containing gameId', async () => {
    const gameId = 'game-abc-123';
    await writeToDatabasePoseMatch('Pose 1-1', gameId);

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(gameId);
  });

  test('calls ref() with path containing pose name and "Match GMT"', async () => {
    const poseName = 'Pose 2-3';
    await writeToDatabasePoseMatch(poseName, 'game-abc-123');

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(poseName);
    expect(pathArg).toContain('Match GMT');
  });

  test('calls set() with a non-empty UTC timestamp string', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-abc-123');

    const valueArg = set.mock.calls[0][1];
    expect(typeof valueArg).toBe('string');
    expect(valueArg.length).toBeGreaterThan(0);
  });

  test('calls set() exactly once per invocation', async () => {
    await writeToDatabasePoseMatch('Pose 1-1', 'game-abc-123');
    expect(set).toHaveBeenCalledTimes(1);
  });

  test('rejects when set() throws (network error)', async () => {
    const networkError = new Error('Network request failed');
    set.mockRejectedValueOnce(networkError);

    await expect(writeToDatabasePoseMatch('Pose 1-1', 'game-abc-123')).rejects.toThrow(
      'Network request failed'
    );
  });

  test('does not swallow errors - propagates rejection to caller', async () => {
    set.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(writeToDatabasePoseMatch('Pose 1-1', 'game-xyz')).rejects.toThrow(
      'Permission denied'
    );
  });
});

// ---------------------------------------------------------------------------
// writeToDatabasePoseStart
// ---------------------------------------------------------------------------
describe('writeToDatabasePoseStart', () => {
  test('calls ref() with path containing gameId', async () => {
    const gameId = 'game-def-456';
    const promises = await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', gameId);
    await Promise.all(promises);

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(gameId);
  });

  test('calls ref() with path containing pose name and "Begin GMT"', async () => {
    const poseName = 'Pose 1-1';
    const promises = await writeToDatabasePoseStart(poseName, 'conj-uuid-001', 'game-abc-123');
    await Promise.all(promises);

    const pathArg = ref.mock.calls[0][1];
    expect(pathArg).toContain(poseName);
    expect(pathArg).toContain('Begin GMT');
  });

  test('calls set() with a non-empty UTC timestamp string', async () => {
    const promises = await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', 'game-abc-123');
    await Promise.all(promises);

    const valueArg = set.mock.calls[0][1];
    expect(typeof valueArg).toBe('string');
    expect(valueArg.length).toBeGreaterThan(0);
  });

  test('calls set() exactly once per invocation', async () => {
    const promises = await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', 'game-abc-123');
    await Promise.all(promises);
    expect(set).toHaveBeenCalledTimes(1);
  });

  test('rejects when set() throws (network error)', async () => {
    set.mockRejectedValueOnce(new Error('Network request failed'));

    const promises = await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', 'game-abc-123');
    await expect(Promise.all(promises)).rejects.toThrow('Network request failed');
  });

  test('propagates permission errors to caller', async () => {
    set.mockRejectedValueOnce(new Error('Permission denied'));

    const promises = await writeToDatabasePoseStart('Pose 1-1', 'conj-uuid-001', 'game-abc-123');
    await expect(Promise.all(promises)).rejects.toThrow('Permission denied');
  });
});
