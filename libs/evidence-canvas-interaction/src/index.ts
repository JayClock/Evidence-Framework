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
  computeGraphLayout,
  type ComputeLayoutOptions,
} from './engine/layoutEngine.js';
export { computeSwimlaneLayout } from './engine/swimlaneLayout.js';
export {
  EMPTY_GRAPH_LAYOUT,
  toSerializableLayout,
  type PlacedContext,
  type PlacedNode,
  type SerializableGraphLayout,
} from './layout/serializable.js';
export type {
  CanvasLayoutMode,
  BusinessMilestoneStage,
  JourneyMilestone,
  JourneyNodePlacement,
  SwimlaneCorridor,
  SwimlaneRegion,
  CanvasViewMode,
  ContextLayoutGroup,
  DomainGraphLayout,
  FulfillmentPairEdge,
  LayoutEdge,
  LayoutEdgeKind,
  LayoutEdgeRoute,
  LayoutNode,
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
