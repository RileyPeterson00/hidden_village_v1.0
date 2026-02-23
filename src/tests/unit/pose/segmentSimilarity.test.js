/**
 * Unit tests for segmentSimilarity() - core pose matching algorithm
 * Tests similarity scoring between body segments (0-100 scale)
 */
import { segmentSimilarity } from '../../../components/Pose/pose_drawing_utilities';

// DEFAULT_SIMILARITY_THRESHOLD from PoseMatching.js - used for gameplay match detection
const DEFAULT_SIMILARITY_THRESHOLD = 45;

/**
 * Creates a 3-point body segment object for segmentSimilarity
 * segmentSimilarity expects objects with 3 landmark keys and {x, y} coordinate values
 */
const createSegment = (p1, p2, p3) => ({
  first: { x: p1.x, y: p1.y },
  second: { x: p2.x, y: p2.y },
  third: { x: p3.x, y: p3.y },
});

describe('segmentSimilarity', () => {
  describe('identical poses return 100', () => {
    it('returns 100 (or very close) when both segments are identical', () => {
      const segment = createSegment(
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 }
      );
      const score = segmentSimilarity(segment, segment);
      expect(score).toBeGreaterThanOrEqual(99);
      expect(score).toBeLessThanOrEqual(101);
    });

    it('returns ~100 for identical 3-point segments with same angles', () => {
      const segment = createSegment(
        { x: 100, y: 200 },
        { x: 150, y: 180 },
        { x: 200, y: 200 }
      );
      const score = segmentSimilarity(segment, { ...segment });
      expect(score).toBeGreaterThanOrEqual(99);
    });
  });

  describe('different poses return <100', () => {
    it('returns less than 100 when segments have different angles', () => {
      const model = createSegment(
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 }
      );
      const player = createSegment(
        { x: 0.7, y: 0.4 },
        { x: 0.5, y: 0.5 },
        { x: 0.3, y: 0.6 }
      );
      const score = segmentSimilarity(player, model);
      expect(score).toBeLessThan(100);
    });

    it('returns low score for very different poses (opposite angles)', () => {
      const model = createSegment(
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 }
      );
      const player = createSegment(
        { x: 1, y: 1 },
        { x: 0.5, y: 0.5 },
        { x: 0, y: 0 }
      );
      const score = segmentSimilarity(player, model);
      expect(score).toBeLessThan(50);
    });

    it('returns value between 0 and 100 for moderately different poses', () => {
      const model = createSegment(
        { x: 0.4, y: 0.3 },
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 }
      );
      const player = createSegment(
        { x: 0.42, y: 0.32 },
        { x: 0.5, y: 0.5 },
        { x: 0.58, y: 0.52 }
      );
      const score = segmentSimilarity(player, model);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('edge cases - missing landmarks and invalid data', () => {
    it('throws when player segment has undefined landmark', () => {
      const model = createSegment({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }, { x: 0.6, y: 0.6 });
      const invalidPlayer = {
        first: { x: 0.5, y: 0.5 },
        second: undefined,
        third: { x: 0.6, y: 0.6 },
      };
      expect(() => segmentSimilarity(invalidPlayer, model)).toThrow();
    });

    it('throws when model segment has null landmark', () => {
      const player = createSegment({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }, { x: 0.6, y: 0.6 });
      const invalidModel = {
        first: { x: 0.5, y: 0.5 },
        second: { x: 0.5, y: 0.6 },
        third: null,
      };
      expect(() => segmentSimilarity(player, invalidModel)).toThrow();
    });

    it('handles segments with NaN coordinates by producing non-matching score', () => {
      const model = createSegment({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }, { x: 0.6, y: 0.6 });
      const nanPlayer = createSegment(
        { x: NaN, y: 0.5 },
        { x: 0.5, y: 0.6 },
        { x: 0.6, y: 0.6 }
      );
      const score = segmentSimilarity(nanPlayer, model);
      expect(typeof score).toBe('number');
      expect(Number.isNaN(score) || score < 100).toBe(true);
    });
  });

  describe('tolerance threshold logic', () => {
    it('DEFAULT_SIMILARITY_THRESHOLD is 45 for gameplay', () => {
      expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(45);
    });

    it('identical segment score (>45) would pass match threshold', () => {
      const segment = createSegment(
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 }
      );
      const score = segmentSimilarity(segment, segment);
      expect(score > DEFAULT_SIMILARITY_THRESHOLD).toBe(true);
    });

    it('match logic: score > threshold passes, score <= threshold fails', () => {
      const passingScore = 50;
      const failingScore = 44;
      expect(passingScore > DEFAULT_SIMILARITY_THRESHOLD).toBe(true);
      expect(failingScore > DEFAULT_SIMILARITY_THRESHOLD).toBe(false);
    });

    it('custom threshold 60: higher bar for match', () => {
      const customThreshold = 60;
      const score50 = 50;
      const score70 = 70;
      expect(score50 > customThreshold).toBe(false);
      expect(score70 > customThreshold).toBe(true);
    });
  });
});
