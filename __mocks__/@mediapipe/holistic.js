const path = require('path');
const mockPoseDataPath = path.resolve(__dirname, '../../src/tests/fixtures/mockPoseData.js');
const { mockBasicPose } = require(mockPoseDataPath);

/**
 * MediaPipe Holistic mock for Jest.
 * Use in tests: no camera required; trigger results with Holistic.__triggerResults(instance, fixtureData).
 * Fixtures: use mockBasicPose, mockRealisticTPose, etc. from src/tests/fixtures/mockPoseData.js
 */

// Standard MediaPipe Pose 33-landmark indices (BlazePose)
const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  LEFT_INDEX: 18,
  LEFT_THUMB: 19,
  RIGHT_PINKY: 20,
  RIGHT_INDEX: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

// Face mesh connectivity (stub for Pose/index.js)
const FACEMESH_FACE_OVAL = [];

class HolisticImpl {
  constructor(options = {}) {
    this.options = options;
    this._onResults = null;

    this.setOptions = jest.fn((opts) => {
      this.options = { ...this.options, ...opts };
    });

    this.send = jest.fn(async ({ image } = {}) => Promise.resolve());
  }

  // Support both holistic.onResults(cb) and holistic.onResults = cb
  set onResults(cb) {
    this._onResults = cb;
  }
  get onResults() {
    return (cb) => {
      this._onResults = cb;
    };
  }
}

function triggerResults(instance, data = mockBasicPose) {
  if (instance && typeof instance._onResults === 'function') {
    instance._onResults(data);
  }
}

const Holistic = jest.fn().mockImplementation(function (options) {
  return new HolisticImpl(options);
});
Holistic.__triggerResults = triggerResults;

module.exports = { Holistic, POSE_LANDMARKS, FACEMESH_FACE_OVAL };