import { createMachine, assign } from "xstate";


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
