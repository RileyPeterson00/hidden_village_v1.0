// Import AFTER manual mock is in place
import { Holistic } from "@mediapipe/holistic";

describe("Holistic mock", () => {
  it("stores callback and triggers results", () => {
    const holistic = new Holistic();

    holistic.setOptions({ modelComplexity: 1 });
    expect(holistic.setOptions).toHaveBeenCalledWith({ modelComplexity: 1 });

    holistic.send({ image: "fakeImage" });
    expect(holistic.send).toHaveBeenCalledWith({ image: "fakeImage" });

    const callback = jest.fn();
    holistic.onResults(callback);

    const fakeResults = { poseLandmarks: [{ x: 0, y: 0 }] };
    Holistic.__triggerResults(fakeResults);

    expect(callback).toHaveBeenCalledWith(fakeResults);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does nothing if __triggerResults is called without onResults", () => {
    const holistic = new Holistic();
    expect(() => Holistic.__triggerResults({})).not.toThrow();
  });
});
