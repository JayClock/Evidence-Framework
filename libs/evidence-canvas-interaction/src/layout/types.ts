import type {
  ContextEntityAST,
  EntityAST,
} from '@evidence-poc/evidence-schema';
import type { Point, Rect } from '../geometry.js';

export type CanvasViewMode = 'simplified' | 'standard' | 'expanded';

export interface LayoutNode {
  nodeId: string;
  entity: EntityAST;
  /** Position relative to the enclosing Context (React Flow parentId). */
  box: Rect;
  /** Absolute canvas coordinates for SVG, focus, overlays and scope bounds. */
  worldBox: Rect;
  contextId: string | null;
}

export interface ContextLayoutGroup {
  contextId: string;
  entity: ContextEntityAST;
  box: Rect;
  worldBox: Rect;
  /** Absolute title bounds. */
  titleBox: Rect;
  depth: number;
  parentContextId: string | null;
  childContextIds: readonly string[];
  nodeIds: readonly string[];
}

export interface LayoutEdgeRoute {
  startPoint: Point;
  bendPoints: readonly Point[];
  endPoint: Point;
}

export type LayoutEdgeKind = 'plays_role' | 'references';

export interface LayoutEdge {
  relationshipId: string;
  kind: LayoutEdgeKind;
  flowKind?: import('@evidence-poc/evidence-schema').RelationshipFlowKind;
  sourceRef: string;
  targetRef: string;
  /** Absolute orthogonal route, including the endpoints. */
  points: readonly Point[];
  route: LayoutEdgeRoute;
  dashed: boolean;
  arrow: boolean;
  crossContext: boolean;
  label: string;
}

export interface FulfillmentPairEdge {
  id: string;
  requestId: string;
  /** A confirmation or a supporting proof; a shared result is placed once. */
  confirmationId: string;
  points: readonly Point[];
}

/** Business semantics, not a second geometry or routing system. */
export interface ResponsibilityLink {
  sourceRef: string;
  roleId: string;
  kind: 'contract_party' | 'responsibility';
}

export type CanvasLayoutMode = 'topology' | 'swimlane';

export interface SwimlaneRegion {
  id: string;
  kind: 'phase' | 'lane';
  label: string;
  /** Absolute coordinates; never written into the business model. */
  box: Rect;
}

export interface DomainGraphLayout {
  swimlaneRegions?: readonly SwimlaneRegion[];
  bounds: Rect;
  nodes: readonly LayoutNode[];
  nodeById: ReadonlyMap<string, LayoutNode>;
  contextGroups: readonly ContextLayoutGroup[];
  contextGroupById: ReadonlyMap<string, ContextLayoutGroup>;
  edges: readonly LayoutEdge[];
  edgeById: ReadonlyMap<string, LayoutEdge>;
  fulfillmentPairs: readonly FulfillmentPairEdge[];
  responsibilityLinks: readonly ResponsibilityLink[];
}
