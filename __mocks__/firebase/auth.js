/**
 * Mock for firebase/auth
 */

const { FIXTURE_USER } = require('./fixtures');

const getAuth = jest.fn(() => ({
  currentUser: FIXTURE_USER,
}));

const onAuthStateChanged = jest.fn((auth, callback) => {
  callback(FIXTURE_USER);
  return jest.fn(); // unsubscribe
});

const setPersistence = jest.fn(() => Promise.resolve());
const browserSessionPersistence = { _name: 'SESSION' };

// Sign-in/sign-up/sign-out (SignIn.js, userDatabase.js, Story.js, NewUserModule.js, CreateAdminForOrg.mjs)
const createUserWithEmailAndPassword = jest.fn(() =>
  Promise.resolve({ user: FIXTURE_USER })
);
const signInWithEmailAndPassword = jest.fn(() =>
  Promise.resolve({ user: FIXTURE_USER })
);
const signOut = jest.fn(() => Promise.resolve());

module.exports = {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
};
