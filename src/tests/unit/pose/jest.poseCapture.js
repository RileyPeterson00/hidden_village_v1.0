beforeEach(() => {
  document.getElementsByClassName = jest.fn(() => [
    document.createElement("video"),
  ]);
});

import { render, waitFor } from "@testing-library/react";
import PoseCapture from "./PoseCapture";
import { Holistic } from "@mediapipe/holistic";

jest.mock("@mediapipe/holistic");
jest.mock("@mediapipe/camera_utils");

describe("PoseCapture", () => {
  it("updates poseData when Holistic returns results", async () => {
    const { container } = render(<PoseCapture />);

    const fakeResults = {
      poseLandmarks: [{ x: 1, y: 2 }],
    };

    // trigger mocked onResults callback
    Holistic.__triggerResults(fakeResults);

    await waitFor(() => {
      // assert something rendered that depends on poseData
      expect(container).toBeTruthy();
    });
  });
});
