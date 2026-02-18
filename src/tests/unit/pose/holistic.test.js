  jest.mock('@mediapipe/holistic');
  import { Holistic } from '@mediapipe/holistic';
  import mockPoseData from '../../fixtures/mockPoseData.js';

  describe('Holistic - mock behavior', () => {
    it('calls onResults with mock data', () => {
      const resultsHandler = jest.fn();

      const holistic = new Holistic({});
      holistic.onResults = resultsHandler;

      // simulate receiving results
      Holistic.__triggerResults(holistic);

      expect(resultsHandler).toHaveBeenCalled();
      expect(resultsHandler).toHaveBeenCalledWith(mockPoseData);
      expect(resultsHandler.mock.calls[0][0].poseLandmarks).toBeDefined();
    });

    it('setOptions is called correctly', () => {
      const holistic = new Holistic({});
      holistic.setOptions({ minDetectionConfidence: 0.5 });

      expect(holistic.setOptions).toHaveBeenCalledWith({
        minDetectionConfidence: 0.5,
      });
    });
  });
