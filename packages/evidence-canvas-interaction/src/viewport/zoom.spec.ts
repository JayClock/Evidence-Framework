import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  pickNextZoomLevel,
  screenToWorld,
  zoomAtPoint,
  zoomByFactor,
  zoomToLevel,
} from '../index.js';

describe('viewport zoom', () => {
  it('clamps to the supported range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('moves through discrete stops', () => {
    expect(pickNextZoomLevel(1, 'in')).toBe(1.25);
    expect(pickNextZoomLevel(1, 'out')).toBe(0.75);
    expect(pickNextZoomLevel(MAX_ZOOM, 'in')).toBe(MAX_ZOOM);
    expect(pickNextZoomLevel(MIN_ZOOM, 'out')).toBe(MIN_ZOOM);
    expect(pickNextZoomLevel(0.9, 'in')).toBe(1);
  });

  it('keeps the anchor world point under the same pixel', () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(anchor, viewport);
    const zoomed = zoomAtPoint(viewport, 2, anchor);
    const after = screenToWorld(anchor, zoomed);

    expect(zoomed.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('returns the same viewport when zoom is unchanged', () => {
    const viewport = { zoom: 1, panX: 10, panY: 10 };

    expect(zoomAtPoint(viewport, 1, { x: 0, y: 0 })).toBe(viewport);
  });

  it('multiplies zoom around the pointer', () => {
    const zoomed = zoomByFactor({ zoom: 1, panX: 0, panY: 0 }, 1.5, {
      x: 0,
      y: 0,
    });

    expect(zoomed.zoom).toBe(1.5);
    expect(zoomed.panX).toBe(0);
  });

  it('steps through levels for keyboard shortcuts', () => {
    expect(
      zoomToLevel({ zoom: 1, panX: 0, panY: 0 }, 'out', { x: 0, y: 0 }).zoom,
    ).toBe(0.75);
  });
});
