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

export {
  COLUMN_GAP,
  CONTEXT_GAP,
  CONTEXT_PADDING,
  CONTEXT_TITLE_HEIGHT,
  FREE_BAND_COLUMNS,
  FULFILLMENT_PADDING,
  LABEL_CHARS_PER_LINE,
  MAX_MEASURED_ATTRIBUTE_ROWS,
  MIN_CONTEXT_WIDTH,
  NODE_ATTRIBUTE_ROW_HEIGHT,
  NODE_BASE_HEIGHT,
  NODE_LABEL_LINE_HEIGHT,
  NODE_WIDTH,
  ROW_GAP,
  STACK_GAP,
  assembleGraphLayout,
  createGraphLayout,
  measureNodeHeight,
  ownerContextId,
  routeEdge,
  translateLayoutObjects,
  type LayoutAssemblyInput,
} from './layout/graphLayout.js';

export {
  EMPTY_GRAPH_LAYOUT,
  toSerializableLayout,
  type PlacedContext,
  type PlacedNode,
  type SerializableGraphLayout,
} from './layout/serializable.js';

export {
  LANE_GAP,
  LANE_HEADER_HEIGHT,
  LANE_PADDING,
  MIN_LANE_WIDTH,
  SHARED_BAND_GAP,
  createLifecycleSwimlaneLayout,
  type LifecycleSwimlaneLayout,
  type LifecycleSwimlaneOptions,
  type Swimlane,
} from './layout/lifecycleSwimlaneLayout.js';

export {
  fulfillmentBoundaryPath,
  resolveFulfillmentAlignment,
  resolveFulfillmentBand,
  type FulfillmentAlignment,
  type FulfillmentBand,
  type FulfillmentMoment,
} from './layout/fulfillmentAlignment.js';

export {
  classifyCrossContextEdge,
  type CrossContextEdgeKind,
} from './layout/edgeClassification.js';

export type {
  CanvasViewMode,
  ContextLayoutGroup,
  DomainGraphLayout,
  FulfillmentLayoutGroup,
  GraphLayoutOptions,
  LayoutEdge,
  LayoutEdgeKind,
  LayoutNode,
  LayoutNodeCategory,
  ResponsibilityLink,
} from './layout/types.js';

export {
  computeContextScope,
  type ContextScope,
} from './selection/contextScope.js';

export {
  computeHighlight,
  emptyHighlight,
  isContextDimmed,
  isEdgeDimmed,
  isNodeDimmed,
  type HighlightInput,
  type HighlightResult,
} from './selection/hoverHighlight.js';

export {
  hitTestLayout,
  selectContextsInBox,
  selectNodesInBox,
  type BoxSelectionOptions,
  type LayoutHit,
} from './selection/boxSelection.js';
