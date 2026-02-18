let mockOnResults;

class Holistic {
  constructor() {}

  setOptions = jest.fn();
  send = jest.fn();

  onResults = (cb) => {
    mockOnResults = cb;
  };

  // <-- static method must be inside class
  static __triggerResults(data) {
    if (mockOnResults) {
      mockOnResults(data);
    }
  }
}

export { Holistic };
