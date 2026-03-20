module.exports = {
  testEnvironment: 'jsdom', // best environment for testing react components
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // loads setup file before every test
  // Auto-mock Firebase (see jest.setup.js) - moduleNameMapper avoids circular resolution
  moduleNameMapper: {
    '^firebase/app$': '<rootDir>/__mocks__/firebase/app.js',
    '^firebase/auth$': '<rootDir>/__mocks__/firebase/auth.js',
    '^firebase/database$': '<rootDir>/__mocks__/firebase/database.js',
    '^firebase/storage$': '<rootDir>/__mocks__/firebase/storage.js',
    '^@mediapipe/holistic$': '<rootDir>/__mocks__/@mediapipe/holistic.js',
    '^@mediapipe/holistic/holistic$': '<rootDir>/__mocks__/@mediapipe/holistic.js',
    '^@mediapipe/camera_utils$': '<rootDir>/__mocks__/@mediapipe/camera_utils.js',
    '^pixi\\.js$': '<rootDir>/__mocks__/pixi.js',
    '^@inlet/react-pixi$': '<rootDir>/__mocks__/@inlet/react-pixi.js',
    '^@pixi/graphics$': '<rootDir>/__mocks__/@pixi/graphics.js',
  },
  roots: ['<rootDir>/src/tests'], // only look into the tests directory for tests
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/firebase/database.js',  // excluded until database coverage is added
    '!src/**/*.test.{js,jsx}',
    '!src/index.js',
  ],
};
