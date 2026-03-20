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

    it('returns input unchanged when poseLandmarks is null', () => {
      const obj = { poseLandmarks: null };
      const result = enrichLandmarks(obj);
      expect(result).toBe(obj);
      expect(result.poseLandmarks).toBeNull();
    });
  });
});

const buildPose = ({ leftHip, rightHip, rightShoulder }) => {
  const landmarks = Array(33).fill(null).map(() => ({
    x: 0.5, y: 0.5, z: 0, visibility: 1,
  }));
  landmarks[23] = { z: 0, visibility: 1, ...leftHip };
  landmarks[24] = { z: 0, visibility: 1, ...rightHip };
  landmarks[12] = { z: 0, visibility: 1, ...rightShoulder };
  return { poseLandmarks: landmarks };
};

describe('enrichLandmarks — PELVIS edge cases', () => {
  it('handles hips at opposite extremes (0.0 and 1.0)', () => {
    const pose = buildPose({
      leftHip:       { x: 0.0, y: 0.0 },
      rightHip:      { x: 1.0, y: 1.0 },
      rightShoulder: { x: 0.5, y: 0.3 },
    });
    enrichLandmarks(pose);
    expect(pose.poseLandmarks[POSE_LANDMARKS.PELVIS].x).toBeCloseTo(0.5);
    expect(pose.poseLandmarks[POSE_LANDMARKS.PELVIS].y).toBeCloseTo(0.5);
  });

  it('handles both hips at the same position (degenerate case)', () => {
    const pose = buildPose({
      leftHip:       { x: 0.5, y: 0.5 },
      rightHip:      { x: 0.5, y: 0.5 },
      rightShoulder: { x: 0.5, y: 0.2 },
    });
    enrichLandmarks(pose);
    expect(pose.poseLandmarks[POSE_LANDMARKS.PELVIS].x).toBeCloseTo(0.5);
    expect(pose.poseLandmarks[POSE_LANDMARKS.PELVIS].y).toBeCloseTo(0.5);
  });
});

describe('enrichLandmarks — SOLAR_PLEXIS formula precision', () => {
  it('SOLAR_PLEXIS.x equals PELVIS.x', () => {
    const pose = buildPose({
      leftHip:       { x: 0.3, y: 0.6 },
      rightHip:      { x: 0.7, y: 0.6 },
      rightShoulder: { x: 0.9, y: 0.3 },
    });
    enrichLandmarks(pose);
    expect(pose.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS].x)
      .toBeCloseTo(pose.poseLandmarks[POSE_LANDMARKS.PELVIS].x);
  });

  it('SOLAR_PLEXIS.x is not copied from RIGHT_SHOULDER.x', () => {
    const pose = buildPose({
      leftHip:       { x: 0.3, y: 0.6 },
      rightHip:      { x: 0.7, y: 0.6 },
      rightShoulder: { x: 0.99, y: 0.3 },
    });
    enrichLandmarks(pose);
    expect(pose.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS].x).not.toBeCloseTo(0.99);
  });

  it('SOLAR_PLEXIS.y = (RIGHT_SHOULDER.y + RIGHT_HIP.y) * 0.6', () => {
    const pose = buildPose({
      leftHip:       { x: 0.4, y: 0.5 },
      rightHip:      { x: 0.6, y: 0.6 },
      rightShoulder: { x: 0.6, y: 0.3 },
    });
    enrichLandmarks(pose);
    expect(pose.poseLandmarks[POSE_LANDMARKS.SOLAR_PLEXIS].y).toBeCloseTo(0.54);
  });

});

describe('enrichLandmarks — mutation contract', () => {
  it('does not remove or overwrite any of the original 33 landmarks', () => {
    const pose = buildPose({
      leftHip:       { x: 0.4, y: 0.5 },
      rightHip:      { x: 0.6, y: 0.5 },
      rightShoulder: { x: 0.6, y: 0.3 },
    });
    const originals = pose.poseLandmarks.slice(0, 33).map((l) => ({ ...l }));
    enrichLandmarks(pose);
    for (let i = 0; i < 33; i++) {
      expect(pose.poseLandmarks[i]).toEqual(originals[i]);
    }
  });
});
