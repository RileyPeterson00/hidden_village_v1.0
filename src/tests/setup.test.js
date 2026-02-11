test('Jest is setup', () => {
  expect(true).toBe(true);
});

test('PIXI.Application creates a mock application', () => {
  const app = new PIXI.Application();

  expect(app.stage.addChild).toBeDefined();
  expect(app.renderer.view).toEqual({});
  expect(PIXI.Application).toHaveBeenCalled();
});
