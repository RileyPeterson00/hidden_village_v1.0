/**
 * Mock for firebase/app
 */

const initializeApp = jest.fn((config) => ({
  options: config,
  name: '[DEFAULT]',
}));

module.exports = {
  initializeApp,
};
