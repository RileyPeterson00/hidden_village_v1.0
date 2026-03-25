# Unit Tests - XState Machines

This folder contains Jest unit tests for the XState machines under `src/machines/`.

## How to run
- `npm test` (runs all tests)
- `npm run test:watch` (watch mode)
- `npm run test:coverage` (coverage report)

## What is covered

- `chapterMachine.test.js`
  - Intro vs outro routing based on `context.isOutro`
  - Timed progression: `idle -> intro.reading/outro.reading -> *.ready`
  - `NEXT` behavior while there is remaining text
  - Completion behavior:
    - transitions to `done`
    - triggers `onIntroComplete` / `onOutroComplete`

- `storyMachine.test.js`
  - Initial state is `ready`
  - `TOGGLE` transitions `ready -> main`
  - Re-sending `TOGGLE` while in `main` does not change state (no transition defined)

- `tutorialMachine.test.js`
  - Initial state is `welcome` and loads the first step text
  - Timed progression through `welcome` and `welcome2`
  - `NEXT` from `running` -> `transition`
  - `transition` -> `running` after timer delay, including step index increment
  - Reaching `final` when `currentStepIndex` reaches the number of tutorial steps

- `gameMachine.test.js` (extra context)
  - Chapter/tutorial/outro transitions and guard routing (`intervention` vs `ending`)
  - Context updates and some edge-case safety (unhandled events / null guard inputs)

