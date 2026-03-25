import { interpret } from "xstate";
import TutorialMachine from "../../../machines/tutorialMachine";
import tutorialData from "../../../scripts/tutorial.toml";

/**
 * Unit tests for `tutorialMachine`.
 *
 * These tests validate:
 * - initial entry loads the first tutorial step text
 * - timed progression through `welcome` / `welcome2` into `running`
 * - `NEXT` behavior while in `running` (to `transition`)
 * - `transition` -> `running` after a timer delay (including step index increment)
 * - reaching `final` when the step index equals the number of steps
 */
describe("TutorialMachine", () => {
  const steps = tutorialData.tutorial.instructions;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createService = (contextOverrides = {}) =>
    interpret(
      TutorialMachine.withContext({
        ...TutorialMachine.context,
        ...contextOverrides,
      })
    );

  test("initial state is welcome and first step is loaded on entry", () => {
    const service = createService().start();
    const state = service.getSnapshot();

    expect(state.value).toBe("welcome");
    expect(state.context.currentStepIndex).toBe(1);
    expect(state.context.text).toBe(steps[0].text);
  });

  test("welcome auto-advances to welcome2 and increments step", () => {
    const service = createService().start();

    jest.advanceTimersByTime(4000);
    const state = service.getSnapshot();

    expect(state.value).toBe("welcome2");
    expect(state.context.currentStepIndex).toBe(2);
    expect(state.context.text).toBe(steps[1].text);
  });

  test("welcome2 auto-advances to running state", () => {
    const service = createService().start();

    jest.advanceTimersByTime(4000 + 10000);
    const state = service.getSnapshot();

    expect(state.value).toBe("running");
    expect(state.context.currentStepIndex).toBeGreaterThan(1);
  });

  test("NEXT from running transitions to transition when step index is valid", () => {
    const service = createService().start();

    // Move to running
    jest.advanceTimersByTime(4000 + 10000);
    expect(service.getSnapshot().value).toBe("running");

    service.send("NEXT");
    expect(service.getSnapshot().value).toBe("transition");
  });

  test("transition shows transition text then advances back to running and moves to next step", () => {
    const service = createService().start();

    // Move to running then to transition
    jest.advanceTimersByTime(4000 + 10000);
    const beforeNext = service.getSnapshot();
    const previousIndex = beforeNext.context.currentStepIndex;

    service.send("NEXT");
    expect(service.getSnapshot().value).toBe("transition");
    expect(service.getSnapshot().context.text).toBe(
      tutorialData.tutorial.transitionText
    );

    // After 2000ms, should go back to running and advance step index
    jest.advanceTimersByTime(2000);
    const state = service.getSnapshot();

    expect(state.value).toBe("running");
    expect(state.context.currentStepIndex).toBe(previousIndex + 1);
    expect(state.context.text).toBe(
      steps[previousIndex].text
    );
  });

  test("tutorial reaches final state when currentStepIndex equals number of steps", () => {
    // Start close to the end of the tutorial
    const nearEndIndex = steps.length - 1;
    const service = createService({
      currentStepIndex: nearEndIndex,
    }).start("running");

    // Simulate last transitions to reach final
    service.send("NEXT"); // transition
    jest.advanceTimersByTime(2000); // back to running, index++

    const stateBeforeFinal = service.getSnapshot();
    expect(stateBeforeFinal.value).toBe("running");
    expect(stateBeforeFinal.context.currentStepIndex).toBe(steps.length);

    service.send("NEXT"); // should satisfy finalStep guard
    const finalState = service.getSnapshot();
    expect(finalState.value).toBe("final");
    expect(finalState.context.text).toBe("final state!");
  });
});

