/**
 * Jest mock for pixi.js. Provides PIXI globals used by components (Application,
 * Container, Graphics, Text, TextStyle, Sprite) without a real canvas.
 * Also sets global.PIXI so code that uses PIXI without importing (e.g. new PIXI.Container())
 * works in tests.
 *
 * Use: mock is applied via jest.config.js moduleNameMapper when tests import "pixi.js".
 */

const PIXI = {
  Application: jest.fn().mockImplementation(() => ({
    stage: { addChild: jest.fn() },
    renderer: { view: {} },
  })),
  Sprite: {
    from: jest.fn().mockReturnValue({}),
  },
  Container: jest.fn().mockImplementation(() => ({
    addChild: jest.fn(),
    removeChild: jest.fn(),
  })),
  Text: jest.fn().mockImplementation(() => ({
    text: '',
    style: {},
  })),
  Graphics: jest.fn().mockImplementation(() => ({
    beginFill: jest.fn(),
    drawRect: jest.fn(),
    endFill: jest.fn(),
    on: jest.fn(),
  })),
  TextStyle: jest.fn(),
};

if (typeof global !== 'undefined') {
  global.PIXI = PIXI;
}

module.exports = PIXI;
