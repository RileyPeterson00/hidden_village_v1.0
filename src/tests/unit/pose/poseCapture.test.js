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

  it('locateFile callback returns the CDN URL for a given file', () => {
    render(<PoseCapture />);
    const locateFile = Holistic.mock.calls[0][0].locateFile;
    expect(locateFile('holistic_solution.wasm')).toBe(
      'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic_solution.wasm'
    );
  });

  it('Button.create builds a PIXI container with children and registers the click handler', () => {
    const { PixiComponent } = require('@inlet/react-pixi');
    // PixiComponent("Button", lifecycle) is called at module-load time, so calls[0] is reliable.
    const [name, lifecycle] = PixiComponent.mock.calls[0];
    expect(name).toBe('Button');

    const onClick = jest.fn();
    const instance = lifecycle.create({ onClick });

    // Container, Graphics, and Text should have been constructed
    expect(global.PIXI.Container).toHaveBeenCalled();
    expect(global.PIXI.Graphics).toHaveBeenCalled();
    expect(global.PIXI.Text).toHaveBeenCalled();
    // pointerup handler wired on the graphic
    const graphic = global.PIXI.Graphics.mock.results[
      global.PIXI.Graphics.mock.results.length - 1
    ].value;
    expect(graphic.on).toHaveBeenCalledWith('pointerup', onClick);
    expect(instance).toBeDefined();
  });

  describe('captureClick countdown', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('runs the countdown and restores button interactivity when the counter reaches zero', async () => {
      const { PixiComponent } = require('@inlet/react-pixi');
      const [, buttonLifecycle] = PixiComponent.mock.calls[0];

      // Temporarily wrap applyProps to intercept captureClick (passed as onClick for the Capture button)
      let captureClickFn = null;
      const originalApplyProps = buttonLifecycle.applyProps;
      buttonLifecycle.applyProps = (instance, oldProps, newProps) => {
        if (newProps.text === 'Capture') captureClickFn = newProps.onClick;
        originalApplyProps(instance, oldProps, newProps);
      };

      render(<PoseCapture />);
      buttonLifecycle.applyProps = originalApplyProps;

      expect(captureClickFn).not.toBeNull();

      const mockButton = { interactive: true, buttonMode: true };
      captureClickFn({ currentTarget: mockButton });

      // 4 ticks × 1 000 ms: counter decrements 3 → 2 → 1 → 0 → -1, triggering the reset
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });

      expect(mockButton.interactive).toBe(true);
      expect(mockButton.buttonMode).toBe(true);
    });
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