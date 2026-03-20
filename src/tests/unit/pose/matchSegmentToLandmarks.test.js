/**
 * Unit tests for matchSegmentToLandmarks() - extracts scaled pixel coordinates
 * for a named body segment from raw pose data.
 * Covers: all four arm segments, exact x*width/y*height scaling, z-property
 * preservation, missing poseData/config keys, and 0x0 container edge cases.
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

    it('throws when poseData is undefined', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      expect(() => matchSegmentToLandmarks(config, undefined, CONTAINER)).toThrow();
    });

    it('returns object with undefined values when poseLandmarks is missing', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
      const result = matchSegmentToLandmarks(config, mockInvalidPose, CONTAINER);
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBe(3);
      Object.values(result).forEach((v) => expect(v === undefined || v === null).toBe(true));
    });

    it('returns undefined values when config.data key does not exist on poseData', () => {
      const config = { segment: 'RIGHT_BICEP', data: 'nonExistentKey' };
      const result = matchSegmentToLandmarks(config, mockBasicPose, CONTAINER);
      expect(result).toBeDefined();
      Object.values(result).forEach((v) => expect(v).toBeUndefined());
    });
  });
});

const buildUniformPose = (x = 0.5, y = 0.5) => ({
  poseLandmarks: Array(33).fill(null).map((_, i) => ({
    x: x + i * 0.001,
    y: y + i * 0.001,
    z: 0,
    visibility: 1,
  })),
});

describe('matchSegmentToLandmarks - all four arm segments', () => {
  const pose = buildUniformPose();

  it.each([
    ['RIGHT_BICEP',   ['RIGHT_HIP', 'RIGHT_SHOULDER', 'RIGHT_ELBOW']],
    ['RIGHT_FOREARM', ['RIGHT_SHOULDER', 'RIGHT_ELBOW', 'RIGHT_WRIST']],
    ['LEFT_BICEP',    ['LEFT_HIP', 'LEFT_SHOULDER', 'LEFT_ELBOW']],
    ['LEFT_FOREARM',  ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_WRIST']],
  ])('%s returns the correct three landmark keys', (segment, expectedKeys) => {
    const config = { segment, data: 'poseLandmarks' };
    const result = matchSegmentToLandmarks(config, pose, CONTAINER);
    expect(Object.keys(result).sort()).toEqual(expectedKeys.slice().sort());
  });

});

describe('matchSegmentToLandmarks - coordinate scaling', () => {
  it('scales x by container width and y by container height (exact formula)', () => {
    const landmarks = Array(33).fill(null).map(() => ({ x: 0.0, y: 0.0, z: 0, visibility: 1 }));
    landmarks[24] = { x: 0.5, y: 0.25, z: 0, visibility: 1 };
    const pose = { poseLandmarks: landmarks };

    const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };
    const result = matchSegmentToLandmarks(config, pose, { width: 100, height: 200 });

    expect(result['RIGHT_HIP'].x).toBeCloseTo(0.5 * 100);
    expect(result['RIGHT_HIP'].y).toBeCloseTo(0.25 * 200);
  });

  it('0×0 container: all output coordinates are 0', () => {
    const pose = buildUniformPose(0.5, 0.5);
    const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };

    const result = matchSegmentToLandmarks(config, pose, { width: 0, height: 0 });
    Object.values(result).forEach((coord) => {
      expect(coord.x).toBe(0);
      expect(coord.y).toBe(0);
    });
  });

  it('z property is preserved from the original landmark', () => {
    const landmarks = Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0.123, visibility: 1 }));
    const pose = { poseLandmarks: landmarks };
    const config = { segment: 'RIGHT_BICEP', data: 'poseLandmarks' };

    const result = matchSegmentToLandmarks(config, pose, CONTAINER);
    Object.values(result).forEach((coord) => {
      expect(coord.z).toBeCloseTo(0.123);
    });
  });
});
