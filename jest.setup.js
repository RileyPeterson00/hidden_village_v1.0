import '@testing-library/jest-dom';

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