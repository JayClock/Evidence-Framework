import { rect } from '../geometry.js';
import type {
  DomainGraphLayout,
  FulfillmentPairEdge,
  LayoutEdge,
  ResponsibilityLink,
} from './types.js';

/** Geometry only: entity records and runtime Map indexes never travel to HTML. */
export type PlacedNode = Omit<DomainGraphLayout['nodes'][number], 'entity'>;
export type PlacedContext = Omit<
  DomainGraphLayout['contextGroups'][number],
  'entity'
>;

export interface SerializableGraphLayout {
  bounds: DomainGraphLayout['bounds'];
  nodes: readonly PlacedNode[];
  contextGroups: readonly PlacedContext[];
  edges: readonly LayoutEdge[];
  fulfillmentPairs: readonly FulfillmentPairEdge[];
  responsibilityLinks: readonly ResponsibilityLink[];
}

export const EMPTY_GRAPH_LAYOUT: SerializableGraphLayout = {
  bounds: rect(0, 0, 0, 0),
  nodes: [],
  contextGroups: [],
  edges: [],
  fulfillmentPairs: [],
  responsibilityLinks: [],
};

export const toSerializableLayout = (
  layout: DomainGraphLayout,
): SerializableGraphLayout => ({
  bounds: layout.bounds,
  nodes: layout.nodes.map(({ nodeId, box, worldBox, contextId }) => ({
    nodeId,
    box,
    worldBox,
    contextId,
  })),
  contextGroups: layout.contextGroups.map(
    ({
      contextId,
      box,
      worldBox,
      titleBox,
      depth,
      parentContextId,
      childContextIds,
      nodeIds,
    }) => ({
      contextId,
      box,
      worldBox,
      titleBox,
      depth,
      parentContextId,
      childContextIds,
      nodeIds,
    }),
  ),
  edges: layout.edges,
  fulfillmentPairs: layout.fulfillmentPairs,
  responsibilityLinks: layout.responsibilityLinks,
});
