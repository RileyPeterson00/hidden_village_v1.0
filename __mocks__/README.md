# Jest mocks

Mocks in this folder are used so tests run without real services or native APIs (camera, canvas, Firebase, etc.). They are applied via `jest.config.js` `moduleNameMapper` (and for Firebase, `jest.mock()` in `jest.setup.js`).

## MediaPipe (`@mediapipe/`)

- **holistic.js** – MediaPipe Holistic (pose/face/hands). No webcam required.
  - In tests: get the Holistic instance (e.g. `Holistic.mock.instances[0]` or from your component), then call `Holistic.__triggerResults(instance, fixtureData)`.
  - Fixtures: use `mockBasicPose`, `mockRealisticTPose`, etc. from `src/tests/fixtures/mockPoseData.js`.
- **camera_utils.js** – Camera wrapper; `start()` runs `onFrame` once so the pipeline can be driven from tests.

## PIXI (`pixi.js`, `@inlet/react-pixi`, `@pixi/graphics`)

- **pixi.js** – Core PIXI (Application, Container, Graphics, Text, TextStyle, Sprite). Also sets `global.PIXI` so code using `PIXI` without importing works.
- **@inlet/react-pixi.js** – React–Pixi bindings (Stage, Container, Graphics, Text, Sprite, PixiComponent, useApp, and stubs for TextInput, Select, etc). Renders as DOM in jsdom.
- **@pixi/graphics.js** – Graphics constructor for code that does `new PIXIGraphics()` (e.g. Pose).

To add or override a mock for a test file only, use `jest.mock('moduleName', () => require('./path/to/__mocks__/...'))` or an inline factory in that test file.
