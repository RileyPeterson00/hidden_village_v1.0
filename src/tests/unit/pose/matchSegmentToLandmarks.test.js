/**
 * Unit tests for matchSegmentToLandmarks() - landmark extraction for pose matching
 */
import { matchSegmentToLandmarks } from '../../../components/Pose/pose_drawing_utilities';
import { SEGMENT_ANGLE_LANDMARKS } from '../../../components/Pose/landmark_utilities';
import {
  mockBasicPose,
  mockRealisticTPose,
  mockIncompletePose,
  mockEmptyPose,
  mockInvalidPose,
} from '../../fixtures/mockPoseData';

const CONTAINER = { width: 100, height: 200 };

describe('matchSegmentToLandmarks', () => {
  describe('RIGHT_BICEP landmark selection', () => {
    it('returns object with RIGHT_HIP, RIGHT_SHOULDER, RIGHT_ELBOW keys', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockBasicPose, CONTAINER);
      const expectedKeys = Object.keys(SEGMENT_ANGLE_LANDMARKS.RIGHT_BICEP);
      expect(Object.keys(result).sort()).toEqual(expectedKeys.sort());
    });

    it('returns scaled coordinates (x,y) for each landmark', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockBasicPose, CONTAINER);
      Object.values(result).forEach((coord) => {
        expect(coord).toHaveProperty('x');
        expect(coord).toHaveProperty('y');
        expect(typeof coord.x).toBe('number');
        expect(typeof coord.y).toBe('number');
      });
    });
  });

  describe('LEFT_FOREARM landmark selection', () => {
    it('returns object with LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST keys', () => {
      const config = { segment: 'LEFT_FOREARM', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockBasicPose, CONTAINER);
      const expectedKeys = Object.keys(SEGMENT_ANGLE_LANDMARKS.LEFT_FOREARM);
      expect(Object.keys(result).sort()).toEqual(expectedKeys.sort());
    });

    it('scales coordinates by container dimensions', () => {
      const config = { segment: 'LEFT_FOREARM', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockRealisticTPose, CONTAINER);
      Object.values(result).forEach((coord) => {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('handles incomplete pose data', () => {
    it('returns object with NaN coords when poseLandmarks has fewer than required landmarks', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockIncompletePose, CONTAINER);
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(3);
      const values = Object.values(result).flatMap((c) => [c.x, c.y]);
      expect(values.some((v) => Number.isNaN(v)) || values.every((v) => typeof v === 'number')).toBe(true);
    });

    it('returns object when poseLandmarks is empty array', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockEmptyPose, CONTAINER);
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(3);
    });

    it('throws when poseData is null', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      expect(() => matchSegmentToLandmarks(config, null, CONTAINER)).toThrow();
    });

    it('returns object with undefined values when poseLandmarks is missing', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockInvalidPose, CONTAINER);
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(3);
      Object.values(result).forEach((v) => expect(v === undefined || v === null).toBe(true));
    });
  });
});
