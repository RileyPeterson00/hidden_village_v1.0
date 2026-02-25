/**
 * Jest mock for @pixi/graphics. Used by Pose and other components that draw with
 * PIXI Graphics. Provides a constructor that returns a mock graphics object so
 * tests don't need a real canvas.
 *
 * Use: add '^@pixi/graphics$': '<rootDir>/__mocks__/@pixi/graphics.js' to
 * jest.config.js moduleNameMapper when testing components that import it.
 */

function Graphics() {
  return {
    beginFill: jest.fn().mockReturnThis(),
    drawRect: jest.fn().mockReturnThis(),
    drawRoundedRect: jest.fn().mockReturnThis(),
    lineStyle: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    endFill: jest.fn().mockReturnThis(),
    drawCircle: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
  };
}

module.exports = { Graphics };
