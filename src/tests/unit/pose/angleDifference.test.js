/**
 * angleDifference() — piecewise exponential scoring (0–100)
 * Internal translation: angle = currentAngle + (PI/2 - desiredAngle)
 * Setting desiredAngle = PI/2 makes translated angle === currentAngle.
 */
import { angleDifference } from '../../../components/Pose/pose_drawing_utilities';

const PI = Math.PI;

// atAngle(a) drives angleDifference with desiredAngle = PI/2, so the
// translated angle equals `a` directly — lets us target each branch precisely.
const atAngle = (angle) => angleDifference(angle, PI / 2);

describe('angleDifference — lower branch (0 ≤ angle ≤ π/2)', () => {
  it('returns a small positive number (~0.17) at the branch minimum (angle = 0)', () => {
    const score = atAngle(0);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns a value approaching 100 at the branch maximum (angle = π/2)', () => {
    const score = atAngle(PI / 2);
    expect(score).toBeGreaterThan(90);
    expect(score).toBeLessThanOrEqual(101);
  });

  it('returns a mid-range score at angle = π/4 (between 0 and π/2)', () => {
    const score = atAngle(PI / 4);
    expect(score).toBeGreaterThan(atAngle(0));
    expect(score).toBeLessThan(atAngle(PI / 2));
  });

  it('is monotonically increasing from angle 0 → π/2', () => {
    const samples = [0, 0.2, 0.4, 0.6, 0.8, PI / 2];
    for (let i = 1; i < samples.length; i++) {
      expect(atAngle(samples[i])).toBeGreaterThan(atAngle(samples[i - 1]));
    }
  });

  it('includes angle=0 as valid (lower branch uses >=0 check)', () => {
    expect(() => atAngle(0)).not.toThrow();
    expect(atAngle(0)).toBeGreaterThan(0);
  });

  it('includes angle=π/2 as valid (lower branch uses <=π/2 check)', () => {
    expect(() => atAngle(PI / 2)).not.toThrow();
    const score = atAngle(PI / 2);
    expect(typeof score).toBe('number');
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe('angleDifference — upper branch (π/2 < angle ≤ π)', () => {
  it('returns a value approaching 100 just above the branch start (angle = π/2 + ε)', () => {
    const score = atAngle(PI / 2 + 0.001);
    expect(score).toBeGreaterThan(90);
    expect(score).toBeLessThanOrEqual(101);
  });

  it('returns a mid-range score at angle = 3π/4', () => {
    const score = atAngle((3 * PI) / 4);
    expect(score).toBeGreaterThan(atAngle(PI));
    expect(score).toBeLessThan(atAngle(PI / 2 + 0.001));
  });

  it('returns a small positive number (~0.17) at the branch maximum (angle = π)', () => {
    const score = atAngle(PI);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('is monotonically decreasing from angle π/2+ε → π', () => {
    const samples = [PI / 2 + 0.01, 1.8, 2.2, 2.6, PI];
    for (let i = 1; i < samples.length; i++) {
      expect(atAngle(samples[i])).toBeLessThan(atAngle(samples[i - 1]));
    }
  });

  it('includes angle=π as valid (upper branch uses <=π check)', () => {
    expect(() => atAngle(PI)).not.toThrow();
    const score = atAngle(PI);
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe('angleDifference — angles outside [0, π] return 0', () => {
  it('returns 0 for a slightly negative translated angle (-0.01)', () => {
    expect(atAngle(-0.01)).toBe(0);
  });

  it('returns 0 for a large negative angle (-π)', () => {
    expect(atAngle(-PI)).toBe(0);
  });

  it('returns 0 for angle just above π (π + 0.01)', () => {
    expect(atAngle(PI + 0.01)).toBe(0);
  });

  it('returns 0 for angle = 2π', () => {
    expect(atAngle(2 * PI)).toBe(0);
  });

  it('returns 0 for a very large positive angle (100)', () => {
    expect(atAngle(100)).toBe(0);
  });
});

describe('angleDifference — output range invariant', () => {
  it('never produces a score below 0 for any angle in [0, π]', () => {
    const step = PI / 100;
    for (let a = 0; a <= PI; a += step) {
      expect(atAngle(a)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never produces a score above 101 for any angle in [0, π]', () => {
    const step = PI / 100;
    for (let a = 0; a <= PI; a += step) {
      expect(atAngle(a)).toBeLessThanOrEqual(101);
    }
  });

  it('always returns a finite number, never NaN or Infinity, for any angle in [0, π]', () => {
    const step = PI / 50;
    for (let a = 0; a <= PI; a += step) {
      const score = atAngle(a);
      expect(Number.isFinite(score)).toBe(true);
    }
  });
});

describe('angleDifference — desiredAngle shift', () => {
  it('returns ~100 when currentAngle equals desiredAngle (player perfectly matches model)', () => {
    const pairs = [
      [0, 0],
      [PI / 4, PI / 4],
      [PI / 2, PI / 2],
      [PI, PI],
    ];
    for (const [cur, des] of pairs) {
      const score = angleDifference(cur, des);
      expect(score).toBeGreaterThan(90);
    }
  });

  it('returns lower score as |currentAngle - desiredAngle| grows', () => {
    const desiredAngle = PI / 4;
    const scoreClose = angleDifference(PI / 4 + 0.05, desiredAngle);
    const scoreFar = angleDifference(PI / 4 + 0.8, desiredAngle);
    expect(scoreClose).toBeGreaterThan(scoreFar);
  });

  it('returns 0 when the shift pushes the translated angle below 0', () => {
    expect(angleDifference(0, PI)).toBe(0);
  });
});
