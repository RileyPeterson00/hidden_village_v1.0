import mockPoseData from '../../src/tests/fixtures/mockPoseData';

export class Holistic {
  constructor(options = {}) {
    this.options = options;
    this._onResults = null;

    // define spyable methods upfront
    this.setOptions = jest.fn((opts) => {
      this.options = { ...this.options, ...opts };
    });

    this.send = jest.fn(async ({ image } = {}) => Promise.resolve());
  }

  set onResults(cb) {
    this._onResults = cb;
  }

  get onResults() {
    return this._onResults;
  }

  static __triggerResults(instance, data = mockPoseData) {
    if (instance && typeof instance._onResults === 'function') {
      instance._onResults(data);
    }
  }
}
