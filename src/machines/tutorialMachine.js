import data from "../scripts/tutorial.toml";

import { createMachine, assign } from "xstate";

/**
 * XState machine that runs the in-game tutorial sequence.
 *
 * It reads tutorial steps from `src/scripts/tutorial.toml` and:
 * - auto-advances through `welcome` and `welcome2` using timers
 * - enters `running`, where the UI should send `NEXT` once the current pose
 *   has been matched (see `src/components/Tutorial.js`)
 * - shows a short `transition` message between steps
 * - transitions to `final` when all steps are complete
 */
const TutorialMachine = createMachine(
  {
    predictableActionArguments: true,
    initial: "welcome",
    context: {
      currentStepIndex: 0,
      steps: data.tutorial.instructions,
      text: "",
    },
    states: {
      welcome: {
        entry: "moveToNextStep",
        exit: "moveToNextStep",
        after: {
          4000: {
            target: "welcome2",
          },
        },
      },
      welcome2: {
        exit: "moveToNextStep",
        after: {
          10000: {
            target: "running",
          },
        },
      },
      running: {
        on: {
          NEXT: [
            {
              target: "final",
              cond: "finalStep",
            },
            {
              target: "transition",
              cond: "isValidTransition",
            },
          ],
        },
      },
      transition: {
        entry: assign({ text: data.tutorial.transitionText }),
        after: {
          2000: {
            target: "running",
            cond: "notFinalStep",
            actions: "moveToNextStep",
          },
        },
      },
      final: {
        entry: assign({ text: "final state!" }),
      },
    },
  },
  {
    guards: {
      notFinalStep: (context) => {
        return context.steps.length > context.currentStepIndex;
      },
      isValidTransition: (context) => {
        return context.currentStepIndex > 0;
      },
      finalStep: (context) => {
        return context.steps.length === context.currentStepIndex;
      },
    },
    actions: {
      moveToNextStep: assign({
        currentStepIndex: (context) => context.currentStepIndex + 1,
        text: (context) => context.steps[context.currentStepIndex].text,
      }),
    },
  }
);
export default TutorialMachine;
