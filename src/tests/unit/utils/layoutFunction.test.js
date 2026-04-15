/**
 * layoutFunction.test.js — unit tests for src/components/utilities/layoutFunction.js
 *
 * generateRowAndColumnFunctions returns two callbacks:
 *   rowFn(rowNumber)    → dimensions for that row
 *   columnFn(colNumber) → dimensions for that column
 *
 * Both callbacks guard against out-of-bounds arguments with a throw.
 * Those guard branches (lines 59-61 and 71-73) are exercised here.
 */

import { generateRowAndColumnFunctions } from '../../../components/utilities/layoutFunction';

const [rowFn, columnFn] = generateRowAndColumnFunctions(
  1280,  // screenWidth
  720,   // screenHeight
  3,     // numberOfRows
  4,     // numberOfColumns
  10,    // marginBetweenRows
  10,    // marginBetweenColumns
  20,    // columnGutter
  20     // rowGutter
);

describe('generateRowAndColumnFunctions', () => {
  describe('rowFn', () => {
    test('returns correct dimensions for a valid row number', () => {
      const dims = rowFn(1);
      expect(dims.width).toBeDefined();
      expect(dims.height).toBeDefined();
      expect(dims.x).toBe(20); // rowGutter
    });

    test('throws when rowNumber exceeds numberOfRows', () => {
      expect(() => rowFn(4)).toThrow('rowNumber is greater than numberOfRows');
    });
  });

  describe('columnFn', () => {
    test('returns correct dimensions for a valid column number', () => {
      const dims = columnFn(1);
      expect(dims.width).toBeDefined();
      expect(dims.height).toBeDefined();
      expect(dims.y).toBe(20); // columnGutter
    });

    test('throws when columnNumber exceeds numberOfColumns', () => {
      expect(() => columnFn(5)).toThrow('columnNumber is greater than numberOfColumns');
    });
  });
});
