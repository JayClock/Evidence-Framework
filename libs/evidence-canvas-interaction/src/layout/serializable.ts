import { rect } from '../geometry.js';

import type {
  DomainGraphLayout,
  FulfillmentLayoutGroup,
  LayoutEdge,
  ResponsibilityLink,
} from './types.js';
import type { Rect } from '../geometry.js';

/**
 * One placed business object, described by where it is rather than by what it is.
 *
 * A reader of a persisted layout already knows the objects — it reads them from
 * the same page or the same document. Carrying the entity record as well would
 * copy every field the model holds, including the ones a reader is not shown, so
 * only the geometry travels.
 */
export interface PlacedNode {
  nodeId: string;
  /** World pixels of the canvas the layout was computed for. */
  box: Rect;
  /** Nearest enclosing Context, `null` for a free participant. */
  contextId: string | null;
}

/** A placed Context container: the frame, not the Context's declarations. */
export interface PlacedContext {
  contextId: string;
  box: Rect;
  titleBox: Rect;
  depth: number;
  parentContextId: string | null;
  childContextIds: readonly string[];
  /** Direct non-context business objects owned by this Context. */
  nodeIds: readonly string[];
  fulfillmentGroupIds: readonly string[];
}

/**
 * A computed layout reduced to plain geometry.
 *
 * The desktop canvas keeps its layout in maps keyed by object id, which is what
 * hit testing and hover want and what `JSON.stringify` silently turns into `{}`.
 * A page that is written to disk and read back by another program needs the
 * placed objects themselves, so this is the same drawing with the indexes and
 * the document records dropped: every reader that starts from a file rebuilds
 * the indexes in one pass, and the records it needs it already has.
 */
export interface SerializableGraphLayout {
  /** The whole drawing, before any viewport transform. */
  bounds: Rect;
  /** Placed business objects; a Context appears in `contextGroups` instead. */
  nodes: readonly PlacedNode[];
  /** Routed relationships, each with the points of its polyline. */
  edges: readonly LayoutEdge[];
  /** Lines that come from a responsibility field rather than a relationship. */
  responsibilityLinks: readonly ResponsibilityLink[];
  /** Container Contexts, outermost first. */
  contextGroups: readonly PlacedContext[];
  /** Request, its confirmations and its proofs, drawn as one band. */
  fulfillmentGroups: readonly FulfillmentLayoutGroup[];
  /** Objects whose `contextRef` resolves to no Context. */
  freeNodeIds: readonly string[];
  /** Empty Context shells, which the layout refuses to draw. */
  omittedContextIds: readonly string[];
}

/** The layout of a model with nothing to draw. */
export const EMPTY_GRAPH_LAYOUT: SerializableGraphLayout = {
  bounds: rect(0, 0, 0, 0),
  nodes: [],
  edges: [],
  responsibilityLinks: [],
  contextGroups: [],
  fulfillmentGroups: [],
  freeNodeIds: [],
  omittedContextIds: [],
};

const placedNodeOf = (node: DomainGraphLayout['nodes'][number]): PlacedNode => ({
  nodeId: node.nodeId,
  box: node.box,
  contextId: node.contextId,
});

const placedContextOf = (
  group: DomainGraphLayout['contextGroups'][number],
): PlacedContext => ({
  contextId: group.contextId,
  box: group.box,
  titleBox: group.titleBox,
  depth: group.depth,
  parentContextId: group.parentContextId,
  childContextIds: group.childContextIds,
  nodeIds: group.nodeIds,
  fulfillmentGroupIds: group.fulfillmentGroupIds,
});

/**
 * Reduces a layout to the geometry that survives a round trip through JSON.
 *
 * Fields are copied by name, so a new field on `DomainGraphLayout` cannot reach
 * a reader as an empty object or as an unvetted document record by accident.
 */
export const toSerializableLayout = (
  layout: DomainGraphLayout,
): SerializableGraphLayout => ({
  bounds: layout.bounds,
  nodes: layout.nodes.map(placedNodeOf),
  edges: layout.edges,
  responsibilityLinks: layout.responsibilityLinks,
  contextGroups: layout.contextGroups.map(placedContextOf),
  fulfillmentGroups: layout.fulfillmentGroups,
  freeNodeIds: layout.freeNodeIds,
  omittedContextIds: layout.omittedContextIds,
});
