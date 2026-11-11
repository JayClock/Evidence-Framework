import {
  DEFAULT_VIEWPORT,
  calculateActualSize,
  calculateZoomToFit,
  screenToWorld,
} from '../index.js';

describe('calculateZoomToFit', () => {
  const window = { width: 1000, height: 600 };

  it('fits and centres content with padding', () => {
    const content = { x: 0, y: 0, width: 500, height: 300 };
    const viewport = calculateZoomToFit(content, window, { padding: 50 });
    const center = screenToWorld(
      { x: window.width / 2, y: window.height / 2 },
      viewport,
    );

    expect(viewport.zoom).toBeCloseTo(5 / 3, 6);
    expect(center.x).toBeCloseTo(250, 6);
    expect(center.y).toBeCloseTo(150, 6);
  });

  it('respects the minimum zoom for very large content', () => {
    const viewport = calculateZoomToFit(
      { x: 0, y: 0, width: 100000, height: 100000 },
      window,
    );

    expect(viewport.zoom).toBe(0.25);
  });

  it('falls back to the default viewport for empty content', () => {
    expect(calculateZoomToFit(null, window)).toBe(DEFAULT_VIEWPORT);
    expect(
      calculateZoomToFit({ x: 0, y: 0, width: 0, height: 0 }, window),
    ).toBe(DEFAULT_VIEWPORT);
    expect(
      calculateZoomToFit({ x: 0, y: 0, width: 10, height: 10 }, window, {
        minZoom: 1,
        maxZoom: 1,
      }).zoom,
    ).toBe(1);
  });

  it('centres at 100 % for actual size', () => {
    const content = { x: -100, y: -100, width: 200, height: 200 };
    const viewport = calculateActualSize(content, window);

    expect(viewport.zoom).toBe(1);
    expect(viewport.panX).toBe(500);
    expect(viewport.panY).toBe(300);
  });
});
