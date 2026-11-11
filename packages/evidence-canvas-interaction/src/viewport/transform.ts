import { rectCenter, type Point, type Rect } from '../geometry.js';

/**
 * Canvas viewport: `world * zoom + pan` gives screen pixels, both measured from
 * the origin of the scrollable stage (the ruler origin), never the window.
 */
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const screenToWorld = (
  point: Point,
  viewport: ViewportState,
): Point => ({
  x: (point.x - viewport.panX) / viewport.zoom,
  y: (point.y - viewport.panY) / viewport.zoom,
});

export const worldToScreen = (
  point: Point,
  viewport: ViewportState,
): Point => ({
  x: point.x * viewport.zoom + viewport.panX,
  y: point.y * viewport.zoom + viewport.panY,
});

/** Translates a screen-space delta (wheel, drag) into world units. */
export const screenDeltaToWorld = (
  delta: Point,
  viewport: ViewportState,
): Point => ({
  x: delta.x / viewport.zoom,
  y: delta.y / viewport.zoom,
});

export const panViewport = (
  viewport: ViewportState,
  dx: number,
  dy: number,
): ViewportState => ({
  ...viewport,
  panX: viewport.panX + dx,
  panY: viewport.panY + dy,
});

export const screenRectToWorldRect = (
  value: Rect,
  viewport: ViewportState,
): Rect => {
  const topLeft = screenToWorld({ x: value.x, y: value.y }, viewport);
  const bottomRight = screenToWorld(
    { x: value.x + value.width, y: value.y + value.height },
    viewport,
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};

export const worldRectToScreenRect = (
  value: Rect,
  viewport: ViewportState,
): Rect => {
  const topLeft = worldToScreen({ x: value.x, y: value.y }, viewport);
  const bottomRight = worldToScreen(
    { x: value.x + value.width, y: value.y + value.height },
    viewport,
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};

/** True when the rectangle shares any area with the viewport window. */
export const isRectVisible = (
  value: Rect,
  viewport: ViewportState,
  window: { width: number; height: number },
): boolean => {
  const projected = worldRectToScreenRect(value, viewport);

  return (
    projected.x < window.width &&
    projected.y < window.height &&
    projected.x + projected.width > 0 &&
    projected.y + projected.height > 0
  );
};

/**
 * World point that stays under the same screen pixel after a viewport change.
 * Used by "zoom to selection" and by the canvas context menu.
 */
export const revealWorldRect = (
  value: Rect,
  viewport: ViewportState,
  window: { width: number; height: number },
): ViewportState => {
  const center = rectCenter(value);
  const screen = worldToScreen(center, viewport);

  return panViewport(
    viewport,
    window.width / 2 - screen.x,
    window.height / 2 - screen.y,
  );
};
