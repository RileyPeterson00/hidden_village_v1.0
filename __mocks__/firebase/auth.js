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

module.exports = {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
};
