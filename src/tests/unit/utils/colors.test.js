import { white, black } from '../../../../utils/colors';

describe('Color Utilities', () => {
  test('white color is defined', () => {
    expect(white).toBeDefined();
  });

  test('black color is defined', () => {
    expect(black).toBeDefined();
  });

  test('white is a string', () => {
    expect(typeof white).toBe('string');
  });

  test('black is a string', () => {
    expect(typeof black).toBe('string');
  });

  test('white has valid hex format', () => {
    expect(white).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test('black has valid hex format', () => {
    expect(black).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test('white and black are different', () => {
    expect(white).not.toBe(black);
  });

  test('colors are not empty strings', () => {
    expect(white.length).toBeGreaterThan(0);
    expect(black.length).toBeGreaterThan(0);
  });
});
