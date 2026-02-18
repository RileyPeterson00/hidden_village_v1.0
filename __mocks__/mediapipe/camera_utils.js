export class Camera {
  constructor(videoElement, options) {
    this.videoElement = videoElement;
    this.options = options;
  }

  start = jest.fn(() => {
    // optionally simulate frame call
    if (this.options.onFrame) {
      this.options.onFrame();
    }
  });
}