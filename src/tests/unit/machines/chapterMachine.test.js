import { interpret } from "xstate";
import chapterMachine from "../../../machines/chapterMachine";

/**
 * Unit tests for `chapterMachine`.
 *
 * These tests validate:
 * - timed transitions: `idle -> intro.reading/outro.reading -> *.ready`
 * - `RESET_CONTEXT` behavior for switching between intro/outro
 * - `NEXT` behavior while dialogue arrays still have remaining entries
 * - completion: transitioning to `done` and triggering callbacks
 */
describe("chapterMachine", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createService = (contextOverrides = {}) =>
    interpret(
      chapterMachine.withContext({
        ...chapterMachine.context,
        ...contextOverrides,
      })
    );

  test("initial state is intro with reading substate", () => {
    const service = createService().start();
    const state = service.getSnapshot();

    expect(state.value).toEqual({ intro: "reading" });
    expect(state.context.isOutro).toBe(false);
  });

  test("idle transitions to intro or outro based on isOutro flag", () => {
    const introService = createService().start();
    introService.send({
      type: "RESET_CONTEXT",
      introText: [{ id: 1 }],
      outroText: [{ id: "a" }],
      scene: [],
      isOutro: false,
    });

    // `idle.after` waits 1000ms before entering `intro.reading`/`outro.reading`.
    jest.advanceTimersByTime(1000);
    expect(introService.getSnapshot().value).toEqual({ intro: "reading" });

    const outroService = createService().start();
    outroService.send({
      type: "RESET_CONTEXT",
      introText: [{ id: 1 }],
      outroText: [{ id: "a" }],
      scene: [],
      isOutro: true,
    });
    jest.advanceTimersByTime(1000);
    expect(outroService.getSnapshot().value).toEqual({ outro: "reading" });
  });

  test("intro reading transitions to ready and enables cursorMode", () => {
    const service = createService().start();

    expect(service.getSnapshot().matches({ intro: "reading" })).toBe(true);
    expect(service.getSnapshot().context.cursorMode).toBe(false);

    jest.advanceTimersByTime(1500);

    const state = service.getSnapshot();
    expect(state.matches({ intro: "ready" })).toBe(true);
    expect(state.context.cursorMode).toBe(true);
  });

  test("intro NEXT loops within intro while there is remaining introText", () => {
    const introText = [{ id: 1 }, { id: 2 }];
    const service = createService({ introText }).start();

    // `intro` has an `entry` action that consumes the first dialogue line up-front.
    service.send("NEXT");

    const state = service.getSnapshot();
    expect(state.value).toEqual({ intro: "reading" });
    expect(state.context.cursorMode).toBe(false);
    expect(state.context.introText.length).toBe(0);
  });

  test("intro completion transitions to done and triggers onIntroComplete callback", () => {
    const onIntroComplete = jest.fn();
    const service = createService({
      introText: [],
      onIntroComplete,
    }).start("intro");

    service.send("NEXT");

    const state = service.getSnapshot();
    expect(state.done).toBe(true);
    expect(state.value).toBe("done");
    expect(onIntroComplete).toHaveBeenCalledTimes(1);
  });

  test("outro reading transitions to ready and enables cursorMode", () => {
    const service = createService().start();
    service.send({
      type: "RESET_CONTEXT",
      introText: [],
      outroText: [{ id: "out1" }],
      scene: [],
      isOutro: true,
    });

    // After RESET_CONTEXT we sit in idle for 1000ms before moving to outro.reading
    jest.advanceTimersByTime(1000);
    expect(service.getSnapshot().matches({ outro: "reading" })).toBe(true);
    expect(service.getSnapshot().context.cursorMode).toBe(false);

    jest.advanceTimersByTime(1500);

    const state = service.getSnapshot();
    expect(state.matches({ outro: "ready" })).toBe(true);
    expect(state.context.cursorMode).toBe(true);
  });

  test("outro completion transitions to done and triggers onOutroComplete callback", () => {
    const onOutroComplete = jest.fn();
    const service = createService({
      isOutro: true,
      outroText: [],
      onOutroComplete,
    }).start("outro");

    service.send("NEXT");

    const state = service.getSnapshot();
    expect(state.done).toBe(true);
    expect(state.value).toBe("done");
    expect(onOutroComplete).toHaveBeenCalledTimes(1);
  });
});

