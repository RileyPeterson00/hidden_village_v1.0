/**
 * Shared jest.mock factories for database.js RTDB-style unit tests (override __mocks__/firebase defaults).
 * Each test file: jest.mock('firebase/auth', () => require('./database.jest.rtdb-mocks').firebaseAuth()); etc.
 */

module.exports = {
  firebaseAuth: () => ({
    getAuth: jest.fn(() => ({
      currentUser: { uid: 'coverage-user', email: 'coverage@test.com' },
    })),
    onAuthStateChanged: jest.fn(() => jest.fn()),
    setPersistence: jest.fn(() => Promise.resolve()),
    browserSessionPersistence: { _name: 'SESSION' },
    createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: null })),
    signOut: jest.fn(() => Promise.resolve()),
  }),

  userDatabase: () => ({
    getCurrentUserContext: jest.fn(),
  }),

  curriculum: () => ({
    Curriculum: {
      CurrentConjectures: [],
      CurrentUUID: null,
      getCurrentConjectures: jest.fn(() => [{ UUID: 'level-uuid-1' }]),
      setCurrentUUID: jest.fn(),
    },
  }),

  jsonToCsv: () => ({
    convertJsonToCsv: jest.fn(async () => 'csv-mock-result'),
  }),
};
