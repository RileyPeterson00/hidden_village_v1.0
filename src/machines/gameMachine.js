import { createMachine, assign } from "xstate";

const GameMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "GameMachine",
    initial: "chapter",
    context: {
      currentConjectureIdx: 0,
      conjectures: [],
      conjectureIdxToIntervention: null,
    },
    states: {
      tutorial: {
        on: {
          NEXT: {
            target: "#GameMachine.chapter",
          },
          SET_CURRENT_CONJECTURE: {
            target: "#GameMachine.chapter",
            actions: assign({
              currentConjectureIdx: (_, event) => event.currentConjectureIdx,
            }),
          },
        },
      },
      chapter: {
        initial: "intro",
        states: {
          intro: {
            on: {
              COMPLETE: "outro",
            },
          },
          outro: {
            on: {
              COMPLETE: "#GameMachine.chapter_transition",
            },
          },
        },
        on: {
          SET_CURRENT_CONJECTURE: {
            actions: assign({
              currentConjectureIdx: (_, event) => event.currentConjectureIdx,
            }),
          },
        },
      },
      chapter_transition: {
        entry: ["updateCurrentConjecture"],
        always: [
          {
            target: "intervention",
            cond: "moveToIntervention",
          },
          {
            target: "ending",
            cond: "moveToEnding",
          },
          {
            target: "chapter",
          },
        ],
      },
      intervention: {
        on: {
          NEXT: {
            target: "chapter",
          },
        },
      },
      ending: {
        type: "final",
      },
    },
  },
  {
    guards: {
      moveToIntervention: (context) => {
        return (
          context.currentConjectureIdx + 1 ===
          context.conjectureIdxToIntervention
        );
      },
      moveToEnding: (context) => {
        return context.currentConjectureIdx === context.conjectures.length - 1;
      },
    },
    actions: {
      updateCurrentConjecture: assign({
        currentConjectureIdx: (context) => context.currentConjectureIdx + 1,
      }),
    },
  }
);

export default GameMachine;
