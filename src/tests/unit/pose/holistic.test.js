import { Holistic } from '@mediapipe/holistic';
import mockPoseData from '../../fixtures/mockPoseData';

describe('Holistic mock', () => {
  it('calls onResults with mock data', () => {
    const resultsHandler = jest.fn();
    const holistic = new Holistic({});
    holistic.onResults = resultsHandler;

    Holistic.__triggerResults(holistic);

    expect(resultsHandler).toHaveBeenCalled();
    expect(resultsHandler).toHaveBeenCalledWith(mockPoseData);
    expect(resultsHandler.mock.calls[0][0].poseLandmarks).toBeDefined();
  });

  it('setOptions is spyable', () => {
    const holistic = new Holistic({});
    holistic.setOptions({ minDetectionConfidence: 0.5 });
    expect(holistic.setOptions).toHaveBeenCalledWith({
      minDetectionConfidence: 0.5,
    });
  });
});
