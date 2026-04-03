/**
 * database.js — module load paths for firebase/auth (onAuthStateChanged)
 *
 * Signed-out vs signed-in bootstrap are split into describes with resetModules + doMock
 * so each path gets the correct auth mock without separate files.
 */

jest.mock('../../../components/CurricularModule/CurricularModule.js', () => ({
  Curriculum: {
    CurrentConjectures: [],
    CurrentUUID: null,
    getCurrentConjectures: jest.fn(() => []),
    setCurrentUUID: jest.fn(),
  },
}));

describe('database.js auth listener (signed-out)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('firebase/auth', () => ({
      getAuth: jest.fn(() => ({ currentUser: null })),
      onAuthStateChanged: jest.fn((auth, callback) => {
        callback(null);
        return jest.fn();
      }),
      setPersistence: jest.fn(() => Promise.resolve()),
      browserSessionPersistence: { _name: 'SESSION' },
      createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
      signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
      signOut: jest.fn(() => Promise.resolve()),
    }));
  });

  test('module loads when onAuthStateChanged receives null user', async () => {
    const db = await import('../../../firebase/database.js');
    expect(db).toBeTruthy();
  });
});

describe('database.js auth bootstrap (signed-in)', () => {
  beforeEach(() => {
    jest.resetModules();
    // Inline factory: doMock('firebase/auth', () => require('__mocks__/firebase/auth')) recurses on `firebase/auth`.
    jest.doMock('firebase/auth', () => {
      const { FIXTURE_USER } = jest.requireActual('../../../../__mocks__/firebase/fixtures.js');
      const getAuth = jest.fn(() => ({ currentUser: FIXTURE_USER }));
      const onAuthStateChanged = jest.fn((auth, callback) => {
        callback(FIXTURE_USER);
        return jest.fn();
      });
      return {
        getAuth,
        onAuthStateChanged,
        setPersistence: jest.fn(() => Promise.resolve()),
        browserSessionPersistence: { _name: 'SESSION' },
        createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: FIXTURE_USER })),
        signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: FIXTURE_USER })),
        signOut: jest.fn(() => Promise.resolve()),
      };
    });
    localStorage.clear();
  });

  test('onAuthStateChanged sets device identity in localStorage when ids missing', async () => {
    await import('../../../firebase/database.js');
    expect(localStorage.getItem('thvo_device_id')).toBeTruthy();
    expect(localStorage.getItem('thvo_device_nickname')).toBeTruthy();
  });

  test('ensureDeviceIdentity keeps existing device id and nickname', async () => {
    localStorage.setItem('thvo_device_id', 'preserved-id');
    localStorage.setItem('thvo_device_nickname', 'preserved-nick');
    await import('../../../firebase/database.js');
    expect(localStorage.getItem('thvo_device_id')).toBe('preserved-id');
    expect(localStorage.getItem('thvo_device_nickname')).toBe('preserved-nick');
  });
});
