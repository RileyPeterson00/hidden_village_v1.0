import '@testing-library/jest-dom';

// Firebase mocks applied via moduleNameMapper in jest.config.js

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