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
  journey?: JourneyNodePlacement;
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

export type BusinessMilestoneStage =
  | 'sourcing'
  | 'agreement'
  | 'advance'
  | 'dispatch'
  | 'inspection'
  | 'breach_remedy'
  | 'clearing';

export interface JourneyMilestone {
  readonly id: string;
  readonly stage: BusinessMilestoneStage;
  readonly label: string;
  readonly order: number;
  readonly x: number;
  readonly width: number;
}

export interface SwimlaneCorridor {
  readonly kind: 'primary_track' | 'remedy_corridor';
  readonly y: number;
  readonly height: number;
}

export interface JourneyNodePlacement {
  readonly stage: BusinessMilestoneStage;
  readonly corridor: SwimlaneCorridor['kind'];
  readonly roleId?: string;
  /** Capability attachment without changing the entity's Context ownership. */
  readonly auxiliaryFor?: string;
}

export interface SwimlaneRegion {
  id: string;
  kind: 'phase' | 'lane' | 'corridor';
  label: string;
  contextId: string | null;
  stage?: BusinessMilestoneStage;
  roleId?: string;
  corridorKind?: SwimlaneCorridor['kind'];
  /** Absolute coordinates; never written into the business model. */
  box: Rect;
}

export interface DomainGraphLayout {
  journeyMilestones?: readonly JourneyMilestone[];
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
