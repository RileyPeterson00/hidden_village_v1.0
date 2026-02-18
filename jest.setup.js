import '@testing-library/jest-dom';

// Auto-mock Firebase modules
jest.mock('firebase/app');
jest.mock('firebase/auth');
jest.mock('firebase/database');
jest.mock('firebase/storage');

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

jest.mock('@inlet/react-pixi', () => ({
  Stage: ({ children }) => <div>{children}</div>,
  Graphics: ({ draw }) => {
    if (draw) draw({}); // simulate draw call
    return <div />;
  },
  Text: ({ text }) => <div>{text}</div>,
  PixiComponent: () => () => <div />,
  useApp: () => ({}),
}));