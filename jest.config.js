module.exports = {
  testEnvironment: 'jsdom', // best environment for testing react components
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // loads setup file before every test
};
