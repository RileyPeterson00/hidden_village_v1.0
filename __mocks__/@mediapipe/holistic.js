// __mocks__/@mediapipe/holistic.js
import mockPoseData from '../mockPoseData.js';

export class Holistic {
  constructor(options) {
    this.options = options;
    this._onResults = null;
  }

  setOptions = jest.fn();
  send = jest.fn(async () => Promise.resolve());

  set onResults(cb) {
    this._onResults = cb;
  }
  get onResults() {
    return this._onResults;
  }

  // **static method must be declared properly**
  static __triggerResults(instance, data = mockPoseData) {
    if (instance && typeof instance._onResults === 'function') {
      instance._onResults(data);
    }
  }
}
