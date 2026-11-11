import { describe, expect, it } from 'vitest';

import {
  insetRect,
  intersectRects,
  resolveCaptureRect,
  toElectronRect,
} from './mcpCapture';

describe('intersectRects', () => {
  it('returns the overlap of two rectangles', () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 20, width: 100, height: 40 },
      ),
    ).toEqual({ x: 50, y: 20, width: 50, height: 40 });
  });

  it('returns null when the rectangles only touch', () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      ),
    ).toBeNull();
  });
});

describe('insetRect', () => {
  it('drops the ruler band and never goes below one pixel', () => {
    expect(
      insetRect({ x: 0, y: 0, width: 200, height: 120 }, { top: 24, left: 24 }),
    ).toEqual({ x: 24, y: 24, width: 176, height: 96 });
    expect(
      insetRect({ x: 0, y: 0, width: 10, height: 10 }, { top: 24, left: 24 }),
    ).toMatchObject({ width: 1, height: 1 });
  });
});

describe('resolveCaptureRect', () => {
  const viewport = { x: 0, y: 48, width: 800, height: 600 };
  const stage = { x: -200, y: 0, width: 2000, height: 900 };

  it('clips the whole stage to the visible canvas', () => {
    expect(
      resolveCaptureRect({ target: null, stage, viewport, rulerThickness: 24 }),
    ).toEqual({ x: 24, y: 72, width: 776, height: 576 });
  });

  it('clips a node target the same way', () => {
    expect(
      resolveCaptureRect({
        target: { x: 100, y: 100, width: 320, height: 120 },
        stage,
        viewport,
        rulerThickness: 24,
      }),
    ).toEqual({ x: 100, y: 100, width: 320, height: 120 });
  });

  it('returns null when the target is scrolled out of view', () => {
    expect(
      resolveCaptureRect({
        target: { x: -4000, y: 100, width: 100, height: 100 },
        stage,
        viewport,
        rulerThickness: 24,
      }),
    ).toBeNull();
  });

  it('returns null without a stage', () => {
    expect(
      resolveCaptureRect({ target: null, stage: null, viewport, rulerThickness: 24 }),
    ).toBeNull();
  });
});

describe('toElectronRect', () => {
  it('drops extra geometry fields', () => {
    expect(
      toElectronRect({ x: 1, y: 2, width: 3, height: 4 }),
    ).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});
