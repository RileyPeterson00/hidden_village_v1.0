/**
 * PoseCapture tests use a MediaPipe Holistic mock so no camera is required.
 * - Mock is defined inline below so the test and component share the same Holistic instance.
 * - Trigger pose results with: Holistic.__triggerResults(holisticInstance, fixtureData)
 * - Use fixtures from ../../fixtures/mockPoseData.js (e.g. mockRealisticTPose, mockBasicPose).
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import PoseCapture from '../../../components/PoseCapture';
import { Holistic } from '@mediapipe/holistic/holistic';
import { mockRealisticTPose } from '../../fixtures/mockPoseData';
import { enrichLandmarks } from '../../../components/Pose/landmark_utilities';

// Inline MediaPipe Holistic mock so test and PoseCapture share one instance (avoids require cycles)
const mockInstances = [];
jest.mock('@mediapipe/holistic/holistic', () => {
  class MockHolistic {
    constructor() {
      mockInstances.push(this);
      this.setOptions = jest.fn();
      this.send = jest.fn().mockResolvedValue(undefined);
      this._onResults = null;
      Object.defineProperty(this, 'onResults', {
        set(cb) {
          this._onResults = cb;
        },
        get() {
          return (cb) => {
            this._onResults = cb;
          };
        },
        configurable: true,
      });
    }
  }
  const HolisticFn = jest.fn().mockImplementation((...args) => new MockHolistic(...args));
  HolisticFn.__triggerResults = (instance, data) => {
    if (instance && typeof instance._onResults === 'function') instance._onResults(data);
  };
  return { Holistic: HolisticFn, POSE_LANDMARKS: {}, FACEMESH_FACE_OVAL: [] };
});
jest.mock('../../../components/Pose/landmark_utilities', () => ({
  enrichLandmarks: jest.fn((data) => ({ ...data, enriched: true })),
}));
jest.mock('../../../components/Pose/index.js', () => {
  const React = require('react');
  return React.forwardRef((props, ref) => <div data-testid="pose" ref={ref} />);
});
jest.mock('../../../components/Background', () => () => (
  <div data-testid="background" />
));

describe('PoseCapture', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    document.body.innerHTML = '';
    const video = document.createElement('video');
    video.className = 'input-video';
    document.body.appendChild(video);
  });

  it('initializes holistic and updates pose data on results', async () => {
    render(<PoseCapture />);

    expect(Holistic).toHaveBeenCalled();
    const holisticInstance = mockInstances[0] || Holistic.mock.instances[0];
    expect(holisticInstance).toBeDefined();
    expect(holisticInstance.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
      })
    );

    act(() => {
      Holistic.__triggerResults(holisticInstance, mockRealisticTPose);
    });

    await waitFor(() => {
      expect(enrichLandmarks).toHaveBeenCalledWith(mockRealisticTPose);
    });
  });
});