/**
 * Unit Tests: UserSaver (src/components/auth/UserSaver.js)
 *
 * Tests save/retrieve of username and password in localStorage.
 * Firebase Auth is not used here - UserSaver only touches localStorage.
 */

import {
  saveUsername,
  getSavedUsername,
  savePassword,
  getSavedPassword,
} from '../../../components/auth/UserSaver.js';

beforeEach(() => {
  localStorage.clear();
});

describe('UserSaver', () => {
  describe('saveUsername / getSavedUsername', () => {
    test('saves username on first login and retrieves it', () => {
      saveUsername('student@school.edu');
      expect(getSavedUsername()).toBe('student@school.edu');
    });

    test('updates existing username when called again', () => {
      saveUsername('old@email.com');
      saveUsername('new@email.com');
      expect(getSavedUsername()).toBe('new@email.com');
    });

    test('returns null when no username has been saved', () => {
      expect(getSavedUsername()).toBeNull();
    });

    test('handles empty string', () => {
      saveUsername('');
      expect(getSavedUsername()).toBe('');
    });
  });

  describe('savePassword / getSavedPassword', () => {
    test('saves password on first login and retrieves it', () => {
      savePassword('secret123');
      expect(getSavedPassword()).toBe('secret123');
    });

    test('updates existing password when called again', () => {
      savePassword('oldpass');
      savePassword('newpass');
      expect(getSavedPassword()).toBe('newpass');
    });

    test('returns null when no password has been saved', () => {
      expect(getSavedPassword()).toBeNull();
    });

    test('handles empty string', () => {
      savePassword('');
      expect(getSavedPassword()).toBe('');
    });
  });

  describe('handles missing or edge-case inputs', () => {
    test('saveUsername with undefined stores string "undefined"', () => {
      saveUsername(undefined);
      expect(getSavedUsername()).toBe('undefined');
    });

    test('savePassword with null stores string "null"', () => {
      savePassword(null);
      expect(getSavedPassword()).toBe('null');
    });

    test('username and password are stored independently', () => {
      saveUsername('user@test.com');
      savePassword('mypassword');
      expect(getSavedUsername()).toBe('user@test.com');
      expect(getSavedPassword()).toBe('mypassword');
    });
  });
});
