/**
 * Unit tests for enrichLandmarks() - pose data enrichment with pelvis/solar plexis
 */
import { enrichLandmarks } from '../../../components/Pose/landmark_utilities';
import { POSE_LANDMARKS } from '@mediapipe/holistic/holistic';
import {
  mockBasicPose,
  mockRealisticTPose,
  mockInvalidPose,
} from '../../fixtures/mockPoseData';

describe('enrichLandmarks', () => {
  describe('enriches pose data correctly', () => {
    it('adds pelvis landmark (index 34)', () => {
      const input = { ...mockBasicPose, poseLandmarks: [...mockBasicPose.poseLandmarks] };
      const result = enrichLandmarks(input);
      expect(result.poseLandmarks[POSE_LANDMARKS.PELVIS]).toBeDefined();
      expect(result.poseLandmarks[POSE_LANDMARKS.PELVIS]).toHaveProperty('x');
      expect(result.poseLandmarks[POSE_LANDMARKS.PELVIS]).toHaveProperty('y');
    });

    it('adds solar plexis landmark (index 33)', () => {
      const input = { ...mockBasicPose, poseLandmarks: [...mockBasicPose.poseLandmarks] };
      const result = enrichLandmarks(input);
      expect(result.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS]).toBeDefined();
      expect(result.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS]).toHaveProperty('x');
      expect(result.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS]).toHaveProperty('y');
    });

    it('pelvis is midpoint of left and right hip', () => {
      const input = { ...mockRealisticTPose, poseLandmarks: [...mockRealisticTPose.poseLandmarks] };
      const leftHip = input.poseLandmarks[23];
      const rightHip = input.poseLandmarks[24];
      const result = enrichLandmarks(input);
      const pelvis = result.poseLandmarks[POSE_LANDMARKS.PELVIS];
      expect(pelvis.x).toBeCloseTo((leftHip.x + rightHip.x) / 2);
      expect(pelvis.y).toBeCloseTo((leftHip.y + rightHip.y) / 2);
    });

    it('returns the same object reference (mutates in place)', () => {
      const input = { ...mockBasicPose, poseLandmarks: [...mockBasicPose.poseLandmarks] };
      const result = enrichLandmarks(input);
      expect(result).toBe(input);
    });
  });

  describe('handles empty/null input', () => {
    it('throws when poseLandmarks is empty array (no hip data to compute pelvis)', () => {
      const input = { poseLandmarks: [] };
      expect(() => enrichLandmarks(input)).toThrow();
    });

    it('returns input when poseLandmarks is missing (invalid pose)', () => {
      const result = enrichLandmarks(mockInvalidPose);
      expect(result).toBe(mockInvalidPose);
      expect(result.poseLandmarks).toBeUndefined();
    });

    it('throws when input is null', () => {
      expect(() => enrichLandmarks(null)).toThrow();
    });

    it('throws when input is undefined', () => {
      expect(() => enrichLandmarks(undefined)).toThrow();
    });
  });
});
