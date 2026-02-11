module.exports = {
  testEnvironment: 'jsdom', // best environment for testing react components
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // loads setup file before every test
  roots: ['<rootDir>/src/tests'], // only look into the tests directory for tests
};
