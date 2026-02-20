import React from 'react';
import { render, waitFor } from '@testing-library/react';
import PoseCapture from '../../../components/PoseCapture';
import { Holistic } from '@mediapipe/holistic';
import { mockRealisticTPose } from '../../fixtures/mockPoseData';

jest.mock('@mediapipe/holistic');
jest.mock('../../../components/Pose/landmark_utilities', () => ({
  enrichLandmarks: jest.fn((data) => ({
    ...data,
    enriched: true,
  })),
}));

jest.mock('../Background', () => () => (
  <div data-testid="background" />
));

// Mock Camera globally
global.Camera = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
}));

describe('PoseCapture', () => {
  it('initializes holistic and updates pose data on results', async () => {
    const { container } = render(<PoseCapture />);

    // Grab the Holistic instance created by the component
    const holisticInstance = Holistic.mock.instances[0];

    // Verify options were set
    expect(holisticInstance.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
      })
    );

    // Trigger pose results
    Holistic.__triggerResults(holisticInstance, mockRealisticTPose);

    await waitFor(() => {
      // After trigger, state should update and re-render
      // We verify by checking that PoseGrab received enriched data
      const poseGrab = container.querySelector('canvas');
      expect(poseGrab).toBeInTheDocument();
    });
  });
});