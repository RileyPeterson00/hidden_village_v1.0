export class Camera {
  constructor(videoElement, options) {
    this.videoElement = videoElement;
    this.options = options;
    this.video = videoElement; // mock video property
  }

  start = jest.fn(async () => {
    if (this.options.onFrame) {
      await this.options.onFrame(); // simulate frame callback
    }
    return Promise.resolve(); // camera.start() is async in real MediaPipe
  });

  stop = jest.fn(() => {
    // optionally simulate stopping
  });
}