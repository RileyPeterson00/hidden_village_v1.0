import { white, black } from '../../../utils/colors';

describe('Color Utilities', () => {
  test('white color is defined', () => {
    expect(white).toBeDefined();
  });

  test('black color is defined', () => {
    expect(black).toBeDefined();
  });

  test('white is a number', () => {
    expect(typeof white).toBe('number');
  });

  test('black is a number', () => {
    expect(typeof black).toBe('number');
  });

  test('white has correct hex value', () => {
    expect(white).toBe(0xffffff);
  });

  test('black has correct hex value', () => {
    expect(black).toBe(0x000000);
  });

  test('white and black are different', () => {
    expect(white).not.toBe(black);
  });

  test('colors are valid hex numbers', () => {
    expect(white).toBeGreaterThanOrEqual(0);
    expect(black).toBeGreaterThanOrEqual(0);
    expect(white).toBeLessThanOrEqual(0xffffff);
  });
});
