import { createMachine, assign } from "xstate";

const chapterMachine = createMachine(
  {
    predictableActionArguments: true,
    /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAYgCUBRAZQoBUB9AYQHkA5WigDVoG0AGALqJQABwD2sXABdcY-MJAAPRAFoAjADY1AOgCcfAKwAWAMwB2ABy61ug4YA0IAJ6IATK6PajmjSet2zNQtjAF8QxzQsPEIibVwIABswEkVYKXQpMG10ADNMgCdkNT4S0kicAmI4xLB+ISQQcUkZOQVlBE9dDXcLPgtfPiM+G1dHFwQ1Ay1tYqMNPjMNDQMV1wMwiIwKmOqklLSMrNyCopK+Mq3oqviknjV60QlpWXkG9rU1b21XftM1M0Ca2WYzcn20Jlchisa0GlhMFg2IHKV1iBCk+TEJFYXF4ggUTWerTeiF6Zm+Fgs-wpfmsphBCA0c20FlcGl6fhMH0+iORlVR+HRmOx3DuD0aTxar1A7RZ9N0XyMgRMdhMcwhfBMPMufLiAox5GodCYbA4IrxDQJkraiG69IMNm0ZmVuh+lK0lKMWqiOrRGO0+TA6AgBCg+3SmWyeTAhUmpRIvJ2vrE-sDwfwUDq+IlL2tCHtOipfEhRn6ays9JLZJMWhsFgBGjMrmVnvCSO1ib1YjIqZDYcOkZOJjOF29HcF3aDIczFuzROliHMnmVrjMQwppP+9Pcrm0ReWpkVBnhfi92yqYEUImjuFQYAFJAAggARABqD9YjAo08ezRzxIQjb0h8JTfCsNh9B4+h8Lop4otoYgAK6CliOLfuKv5zkoNoaLo4KaDYOEQkEFhGEBfhkoskwWPCqz-K4sE6ohyHCrw9xZhhUpYQguiNtoOGxlorhqCu-RAa41i7qy1gAn4bLUQxOxMfqlA0AwLDsKh5o-oSnHvCYzIGD8tgGCyZiGfCozOIgwlHl4lLUeJujmIZ6ytgmVRKcmAaTumfYRsc0ZFHY5zxu2HlIX63lphmWnoTpuZGCs2hHlC3gLCY8IAmJ3S7hSWiDDxgSuZso5VAkYg+VArAXlIjDYOgIgFAaqnGhpZpipaf7zggKico61ZDrYRg8Z8vgmBWkyOqYugOU2M0lmErb4GIEBwAo7lEOx8X-iokK4foxjmFYNh2AYQEWLufDdMJHiUqqWhmAp1w1FtVo7TdjplmlJGJSZah2uJMxOdRJFUWZxVtqV-KCq9XVcc2MxmEWwlIyuDZzPSy7MjW3TykYrLmE90ORT26aw5h7RDDu-zIyuRaLKuGh2tB4LmGZq6cuBAJE7qgopkG4zaW93WMvp5gZfCXQusNZjM7hGUAgYHMfPo3NuWFxNdqTUDk7pbissy4mkj8iqaA4VkTIYyVXUJkxmLYTYNjzF5XvkN53lIuu5rtuGTBC5gNkE9vwkBV24VMtIrPjNhmTznle-+RvJe49b+yRTpASjyUUkrczLGshlxxFXnawn3X3cnK6LGnirjRbwkkbuyyaP4Qkspq6tQ-Bxf8xAgtxcLXEmRRaz6KPGriUz9cm039r8YZQRNjz5WVdVii1fVjXRmXXG7RdlbuEOq4eEZmNGJ4Bg8VMhhOsMTo8xAchgDv7zCXwQM4WyjJOmWmfBMlSt+gzRKHnDuYQgA */
    initial: "intro",
    context: {
      introText: [],
      outroText: [],
      scene: [],
      currentText: {},
      lastText: [],
      cursorMode: false,
      isOutro: false,
      onIntroComplete: () => {},
      onOutroComplete: () => {},
    },
    states: {
      idle: {
        after: {
          1000: [
            {
              target: "outro",
              cond: (context) => context.isOutro,
            },
            {
              target: "intro",
            },
          ],
        },
      },
      intro: {
        entry: ["introDialogueStep"],
        initial: "reading",
        states: {
          reading: {
            after: {
              1500: {
                target: "ready",
                actions: assign({ cursorMode: true })
              }
            }
          },
          ready: {}
        },
        on: {
          NEXT: [
            {
              target: "intro",
              cond: "continueIntro",
              actions: assign({ cursorMode: false })
            },
            {
              target: "done",
              cond: (context) => context.introText.length === 0,
              actions: "triggerOnIntroComplete",
            },
          ],
          RESET_CONTEXT: {
            target: "idle",
            actions: "resetContext",
          },
        },
      },
      introReading: {
        after: {
          3000: {
            target: "intro",
          },
        },
      },
      experiment: {
        on: {
          ADVANCE: {
            target: "outro",
          },
        },
      },
      outro: {
        entry: "outroDialogStep",
        initial: "reading",
        states: {
          reading: {
            after: {
              1500: {
                target: "ready",
                actions: assign({ cursorMode: true })
              }
            }
          },
          ready: {}
        },
        on: {
          NEXT: [
            {
              target: "outro",
              cond: "continueOutro",
              actions: assign({ cursorMode: false })
            },
            {
              target: "done",
              cond: (context) => context.outroText.length === 0,
              actions: "triggerOnOutroComplete",
            },
          ],
          RESET_CONTEXT: {
            target: "idle",
            actions: "resetContext",
          },
        },
      },
      loadingNextChapter: {
        on: {
          RESET_CONTEXT: {
            target: "idle",
            actions: "resetContext",
          },
        },
      },
      done: {
        type: "final",
      },
    },
    on: {
      RESET_CONTEXT: {
        target: "idle",
        actions: "resetContext",
      },
    },
  },
  {
    guards: {
      continueIntro: (context) => context.introText.length > 0,
      continueOutro: (context) => context.outroText.length > 0,
    },
    actions: {
      resetContext: assign({
        introText: (_, event) => event.introText,
        outroText: (_, event) => event.outroText,
        scene: (_, event) => event.scene,
        currentText: (_, event) => event.isOutro ? event.outroText[0] || null : event.introText[0] || null,
        lastText: () => [],
        cursorMode: (_, event) => event.cursorMode !== undefined ? event.cursorMode : false,
        isOutro: (_, event) => event.isOutro,
        // Update callbacks if provided in event (they use refs so they're always current)
        onIntroComplete: (_, event) => event.onIntroComplete !== undefined ? event.onIntroComplete : (context) => context.onIntroComplete,
        onOutroComplete: (_, event) => event.onOutroComplete !== undefined ? event.onOutroComplete : (context) => context.onOutroComplete,
      }),
      introDialogueStep: assign({
        currentText: (context) => context.introText[0] || {},
        introText: (context) => context.introText.length > 0 ? context.introText.slice(1) : [],
        lastText: (context) => context.introText.length > 0 ? [...context.lastText, context.currentText] : [],
      }),
      toggleCursorMode: assign({
        cursorMode: (context) => !context.cursorMode,
      }),
      outroDialogStep: assign({     
        currentText: (context) => context.outroText[0] || {},
        outroText: (context) => context.outroText.length > 0 ? context.outroText.slice(1) : [],
        lastText: (context) => context.outroText.length > 0 ? [...context.lastText, context.currentText] : [],
      }),
      triggerOnIntroComplete: (context) => context.onIntroComplete(),
      triggerOnOutroComplete: (context) => context.onOutroComplete?.(),
    },
  }
);

export default chapterMachine;
