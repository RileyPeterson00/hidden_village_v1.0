/**
 * Jest mock for @inlet/react-pixi. Provides Stage, Container, Graphics, Text,
 * PixiComponent, useApp so components using react-pixi render in jsdom without
 * a real Pixi application or canvas.
 *
 * Use: mock is applied via jest.config.js moduleNameMapper when tests import "@inlet/react-pixi".
 */

const React = require('react');

function Stage(props) {
  return React.createElement('div', null, props.children);
}

const Container = React.forwardRef(function Container(props, ref) {
  return React.createElement('div', { ref: ref }, props.children);
});

function Graphics(props) {
  const g = {
    beginFill: jest.fn().mockReturnThis(),
    drawRect: jest.fn().mockReturnThis(),
    drawRoundedRect: jest.fn().mockReturnThis(),
    lineStyle: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    endFill: jest.fn().mockReturnThis(),
  };
  if (typeof props.draw === 'function') {
    props.draw(g);
  }
  return null;
}

const Text = React.forwardRef(function Text(props, ref) {
  if (ref) {
    ref.current = { text: '', x: 0, y: 0 };
  }
  return null;
});

function PixiComponent(name, lifecycle) {
  return React.forwardRef(function PixiComponentForwardRef(props, ref) {
    const instance = {
      children: [
        {
          clear: jest.fn(),
          beginFill: jest.fn(),
          drawRect: jest.fn(),
          endFill: jest.fn(),
          interactive: false,
          buttonMode: false,
        },
        { text: '', x: 0, y: 0 },
      ],
    };
    if (lifecycle && typeof lifecycle.applyProps === 'function') {
      lifecycle.applyProps(instance, {}, props);
    }
    if (ref) {
      ref.current = instance;
    }
    return null;
  });
}

function useApp() {
  return {
    stage: { addChild: jest.fn() },
    renderer: { resize: jest.fn() },
  };
}

function Sprite(props) {
  return null;
}

// Stubs for components that import these (e.g. AdminHomeModule/NewUserModule)
const TextInput = () => null;
const Select = () => null;
const lineStyle = jest.fn();
const beginFill = jest.fn();
const drawRect = jest.fn();
const endFill = jest.fn();

module.exports = {
  Stage,
  Container,
  Graphics,
  Text,
  Sprite,
  TextInput,
  Select,
  lineStyle,
  beginFill,
  drawRect,
  endFill,
  PixiComponent: jest.fn(PixiComponent),
  useApp,
};
