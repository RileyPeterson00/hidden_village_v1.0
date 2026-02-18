const mockSend = jest.fn();
const mockSetOptions = jest.fn();
let mockOnResults;

class Holistic {
  constructor() {}

  setOptions = mockSetOptions;

  send = mockSend;

  onResults = (cb) => {
    mockOnResults = cb;
  };
}

Holistic.__triggerResults = (data) => {
  if (mockOnResults) {
    mockOnResults(data);
  }
};

export { Holistic };