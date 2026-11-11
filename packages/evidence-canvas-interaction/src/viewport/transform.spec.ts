import {
  DEFAULT_VIEWPORT,
  isRectVisible,
  panViewport,
  screenDeltaToWorld,
  screenRectToWorldRect,
  screenToWorld,
  worldRectToScreenRect,
  worldToScreen,
} from '../index.js';

describe('viewport transform', () => {
  const viewport = { zoom: 2, panX: 40, panY: -20 };

  it('projects world to screen with zoom then pan', () => {
    expect(worldToScreen({ x: 10, y: 5 }, viewport)).toEqual({
      x: 60,
      y: -10,
    });
  });

  it('round-trips screen and world points', () => {
    const world = { x: 123.25, y: -47.5 };

    expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(
      world,
    );
  });

  it('scales screen deltas into world units', () => {
    expect(screenDeltaToWorld({ x: 100, y: -50 }, viewport)).toEqual({
      x: 50,
      y: -25,
    });
  });

  it('pans without touching zoom', () => {
    expect(panViewport(DEFAULT_VIEWPORT, 12, -8)).toEqual({
      zoom: 1,
      panX: 12,
      panY: -8,
    });
  });

  it('round-trips rectangles between spaces', () => {
    const screen = { x: 10, y: 20, width: 200, height: 100 };
    const world = screenRectToWorldRect(screen, viewport);

    expect(world).toEqual({ x: -15, y: 20, width: 100, height: 50 });
    expect(worldRectToScreenRect(world, viewport)).toEqual(screen);
  });

  it('reports visibility only for rectangles overlapping the window', () => {
    const window = { width: 1024, height: 768 };

    expect(
      isRectVisible({ x: 0, y: 0, width: 100, height: 100 }, viewport, window),
    ).toBe(true);
    expect(
      isRectVisible(
        { x: -5000, y: 0, width: 100, height: 100 },
        viewport,
        window,
      ),
    ).toBe(false);
  });
});
