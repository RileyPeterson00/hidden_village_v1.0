import { createMachine, assign } from "xstate";

/**
 * XState machine for the top-level story flow.
 *
 * Current behavior (minimal):
 * - `ready`: waits for the UI to finish setup (auth + org selection), then moves to `main`.
 * - `main`: placeholder state (no further transitions currently defined).
 *
 * Event
 * - `TOGGLE`: transitions `ready` -> `main`
 *
 * Used by `src/components/Story.js`.
 */
export const StoryMachine = createMachine({
  predictableActionArguments: true,
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOgCcx0IBPAYgBUB5AcWYBkBRAbQAYBdRKAAOAe1i4ALrhH5BIAB6IAjAGYA7CQBMSgBxqArPp6aeATh2bNANgA0Iaoh1KSAFlPu1alTpc8rOqxcAXxC7fBEIODk0LDxCIjlRcSkZOUUEAFpbe0Qs0JAYnAJickoaRLFJaVkkBUQXTTsHBAsSHnaOtRcG430lfMK4kowCCuTqtMRrZz79KzUrHiV9FytNfRUmx2d3Dy8fPwDgkKCgA */
  initial: "ready",
  context: {
    holistic: undefined,
  },
  states: {
    ready: {
      on: {
        TOGGLE: "main",  // move to game
      },
    },
    main: {
      
    },
  },
}, {
});
