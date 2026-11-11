export {
  boundsOfRects,
  insetRect,
  normalizeRect,
  rect,
  rectBottom,
  rectCenter,
  rectContainsPoint,
  rectContainsRect,
  rectRight,
  rectsIntersect,
  translateRect,
  unionRects,
  type Point,
  type Rect,
  type Size,
} from './geometry.js';

export {
  DEFAULT_VIEWPORT,
  isRectVisible,
  panViewport,
  revealWorldRect,
  screenDeltaToWorld,
  screenRectToWorldRect,
  screenToWorld,
  worldRectToScreenRect,
  worldToScreen,
  type ViewportState,
} from './viewport/transform.js';

export {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_LEVELS,
  clampZoom,
  pickNextZoomLevel,
  zoomAtPoint,
  zoomByFactor,
  zoomToLevel,
} from './viewport/zoom.js';

export {
  DEFAULT_FIT_PADDING,
  calculateActualSize,
  calculateZoomToFit,
  type FitOptions,
} from './viewport/fit.js';

export {
  DEFAULT_MIN_MAJOR_STEP_PX,
  DEFAULT_MINOR_DIVISIONS,
  RULER_STEP_LADDER,
  getRulerTicks,
  pickRulerStep,
} from './ruler/math.js';

export type {
  RulerAxis,
  RulerTick,
  RulerTickLevel,
  RulerTickOptions,
} from './ruler/types.js';
