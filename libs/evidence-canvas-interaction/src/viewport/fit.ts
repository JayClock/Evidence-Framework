import type { Rect, Size } from '../geometry.js';
import { DEFAULT_VIEWPORT, type ViewportState } from './transform.js';
import { MAX_ZOOM, MIN_ZOOM, clampZoom } from './zoom.js';

export interface FitOptions {
  /** Screen pixels kept clear around the content on every side. */
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

export const DEFAULT_FIT_PADDING = 64;

/**
 * Centres the content rectangle inside the viewport window.
 *
 * Empty or degenerate content falls back to {@link DEFAULT_VIEWPORT}, so a cold
 * start never produces `Infinity`/`NaN` transforms.
 */
export const calculateZoomToFit = (
  content: Rect | null,
  window: Size,
  options: FitOptions = {},
): ViewportState => {
  if (
    content === null ||
    content.width <= 0 ||
    content.height <= 0 ||
    window.width <= 0 ||
    window.height <= 0
  ) {
    return DEFAULT_VIEWPORT;
  }

  const padding = options.padding ?? DEFAULT_FIT_PADDING;
  const minZoom = options.minZoom ?? MIN_ZOOM;
  const maxZoom = options.maxZoom ?? MAX_ZOOM;
  const availableWidth = Math.max(1, window.width - padding * 2);
  const availableHeight = Math.max(1, window.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availableWidth / content.width, availableHeight / content.height),
  );

  return {
    zoom: Math.min(maxZoom, Math.max(minZoom, zoom)),
    panX: (window.width - content.width * zoom) / 2 - content.x * zoom,
    panY: (window.height - content.height * zoom) / 2 - content.y * zoom,
  };
};

/** Resets to 100 % while keeping the content centred. */
export const calculateActualSize = (
  content: Rect | null,
  window: Size,
): ViewportState =>
  calculateZoomToFit(content, window, {
    padding: 0,
    minZoom: 1,
    maxZoom: 1,
  });
