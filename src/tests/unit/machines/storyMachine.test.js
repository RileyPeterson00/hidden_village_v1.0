import { interpret } from "xstate";
import { StoryMachine } from "../../../machines/storyMachine";

/**
 * Unit tests for `StoryMachine`.
 *
 * These tests validate:
 * - initial state is `ready`
 * - `TOGGLE` transitions `ready -> main`
 * - sending `TOGGLE` again in `main` does not change state (no transition defined)
 */
describe("StoryMachine", () => {
  test("initial state is ready", () => {
    const service = interpret(StoryMachine).start();
    const state = service.getSnapshot();

    expect(state.value).toBe("ready");
    expect(state.context.holistic).toBeUndefined();
  });

  test("TOGGLE transitions from ready to main", () => {
    const service = interpret(StoryMachine).start();

    expect(service.getSnapshot().value).toBe("ready");

    // `TOGGLE` is only handled in the `ready` state.
    service.send("TOGGLE");

    const state = service.getSnapshot();
    expect(state.value).toBe("main");
  });

  test("remains in main when receiving TOGGLE again (no transition defined)", () => {
    const service = interpret(StoryMachine).start();

    // `main` currently has no `on: { TOGGLE: ... }`, so the state should stay `main`.
    service.send("TOGGLE");
    expect(service.getSnapshot().value).toBe("main");

    service.send("TOGGLE");
    expect(service.getSnapshot().value).toBe("main");
  });
});

