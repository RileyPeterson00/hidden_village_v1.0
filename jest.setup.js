import '@testing-library/jest-dom';

// Auto-mock Firebase modules (configured in jest.config.js moduleNameMapper)
// Note: jest.mock() with factory causes circular resolution; moduleNameMapper is required

// PixiJS mocks
global.PIXI = {
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
  })),
};