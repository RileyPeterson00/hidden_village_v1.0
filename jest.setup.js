import '@testing-library/jest-dom';

// Routine console noise from app code (e.g. database.js) drowns out real failures in CI/local runs.
// By default we noop log / debug / info / warn / error. Tests that assert on console use jest.spyOn first.
// Full console: npm run test:verbose-console  (or VERBOSE_TESTS=1)
if (process.env.VERBOSE_TESTS !== '1') {
  const noop = () => {};
  const c = globalThis.console;
  c.log = noop;
  c.debug = noop;
  c.info = noop;
  c.warn = noop;
  c.error = noop;
}

// Auto-mock Firebase modules
jest.mock('firebase/app');
jest.mock('firebase/auth');
jest.mock('firebase/database');
jest.mock('firebase/storage');

// MediaPipe Holistic: mocked via jest.config.js moduleNameMapper (__mocks__/@mediapipe/holistic.js).
// Tests can trigger results with Holistic.__triggerResults(instance, fixtureData); no webcam required.

// PIXI and @inlet/react-pixi: mocked via jest.config.js moduleNameMapper (__mocks__/pixi.js, __mocks__/@inlet/react-pixi.js).
// Ensure global.PIXI is set for tests that use PIXI without importing (e.g. setup.test.js).
require('./__mocks__/pixi.js');