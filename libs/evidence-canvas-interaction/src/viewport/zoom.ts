import type { Point } from '../geometry.js';
import { screenToWorld, type ViewportState } from './transform.js';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Discrete stops used by keyboard zoom and the zoom menu. */
export const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4,
] as const;

export const clampZoom = (zoom: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * Next discrete stop in one direction. Falls back to a 1.25 factor when the
 * current zoom sits between stops (trackpad pinch produces such values).
 */
export const pickNextZoomLevel = (
  zoom: number,
  direction: 'in' | 'out',
): number => {
  if (direction === 'in') {
    const next = ZOOM_LEVELS.find((level) => level > zoom + 1e-6);

    return next ?? MAX_ZOOM;
  }

  const previous = [...ZOOM_LEVELS]
    .reverse()
    .find((level) => level < zoom - 1e-6);

  return previous ?? MIN_ZOOM;
};

/** Zooms while keeping the world point under `anchor` on the same pixel. */
export const zoomAtPoint = (
  viewport: ViewportState,
  requestedZoom: number,
  anchor: Point,
): ViewportState => {
  const zoom = clampZoom(requestedZoom);

  if (zoom === viewport.zoom) {
    return viewport;
  }

  const world = screenToWorld(anchor, viewport);

  return {
    zoom,
    panX: anchor.x - world.x * zoom,
    panY: anchor.y - world.y * zoom,
  };
};

/** Multiplicative zoom used for ctrl/cmd + wheel and pinch gestures. */
export const zoomByFactor = (
  viewport: ViewportState,
  factor: number,
  anchor: Point,
): ViewportState => zoomAtPoint(viewport, viewport.zoom * factor, anchor);

export const zoomToLevel = (
  viewport: ViewportState,
  direction: 'in' | 'out',
  anchor: Point,
): ViewportState =>
  zoomAtPoint(viewport, pickNextZoomLevel(viewport.zoom, direction), anchor);
