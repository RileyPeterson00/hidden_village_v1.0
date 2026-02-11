module.exports = {
  testEnvironment: 'jsdom', // best environment for testing react components
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // loads setup file before every test
  // Auto-mock Firebase (see jest.setup.js) - moduleNameMapper avoids circular resolution
  moduleNameMapper: {
    '^firebase/app$': '<rootDir>/__mocks__/firebase/app.js',
    '^firebase/auth$': '<rootDir>/__mocks__/firebase/auth.js',
    '^firebase/database$': '<rootDir>/__mocks__/firebase/database.js',
    '^firebase/storage$': '<rootDir>/__mocks__/firebase/storage.js',
  },
};
