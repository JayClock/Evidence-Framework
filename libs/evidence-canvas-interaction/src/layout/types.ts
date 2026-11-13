import type {
  ContextEntityAST,
  EntityAST,
} from '@evidence-poc/evidence-schema';

import type { Point, Rect } from '../geometry.js';

export type LayoutNodeCategory = 'evidence' | 'participant' | 'role';

/** One placed business object; coordinates are world (canvas) pixels. */
export interface LayoutNode {
  nodeId: string;
  entity: EntityAST;
  box: Rect;
  /** Nearest enclosing Context, `null` for free participants. */
  contextId: string | null;
}

export type LayoutEdgeKind = 'plays_role' | 'references';

/** Routed relationship edge, ready for SVG rendering. */
export interface LayoutEdge {
  relationshipId: string;
  kind: LayoutEdgeKind;
  sourceRef: string;
  targetRef: string;
  points: readonly Point[];
  /** Cross-boundary references and every `plays_role` are dashed. */
  dashed: boolean;
  arrow: boolean;
  crossContext: boolean;
  label: string;
}

/**
 * Line that comes from an explicit responsibility field rather than from a
 * relationship: `contract_party` from `roleRefs`, `responsibility` from
 * `responsibleRoleRef`.
 */
export interface ResponsibilityLink {
  sourceRef: string;
  roleId: string;
  kind: 'contract_party' | 'responsibility';
}

export interface ContextLayoutGroup {
  contextId: string;
  entity: ContextEntityAST;
  box: Rect;
  titleBox: Rect;
  depth: number;
  parentContextId: string | null;
  childContextIds: readonly string[];
  /** Direct non-context business objects owned by this Context. */
  nodeIds: readonly string[];
  fulfillmentGroupIds: readonly string[];
}

export interface FulfillmentLayoutGroup {
  groupId: string;
  contractId: string | null;
  requestId: string;
  confirmationIds: readonly string[];
  proofIds: readonly string[];
  /**
   * Results of this pair that sit in another request's row.
   *
   * One confirmation may discharge several requests; the layout places it once,
   * so the row that does not own the stamp reports it here instead of drawing a
   * second box. The pair link still runs to the shared stamp.
   */
  sharedResultIds: readonly string[];
  /** The frame only covers objects this row actually placed. */
  box: Rect;
}

export interface DomainGraphLayout {
  bounds: Rect;
  nodes: readonly LayoutNode[];
  nodeById: ReadonlyMap<string, LayoutNode>;
  edges: readonly LayoutEdge[];
  edgeById: ReadonlyMap<string, LayoutEdge>;
  responsibilityLinks: readonly ResponsibilityLink[];
  contextGroups: readonly ContextLayoutGroup[];
  contextGroupById: ReadonlyMap<string, ContextLayoutGroup>;
  fulfillmentGroups: readonly FulfillmentLayoutGroup[];
  fulfillmentGroupByRequest: ReadonlyMap<string, FulfillmentLayoutGroup>;
  /** Business objects whose `contextRef` is missing or unresolvable. */
  freeNodeIds: readonly string[];
  /** Empty Context shells the layout refused to draw. */
  omittedContextIds: readonly string[];
}

export type CanvasViewMode = 'simplified' | 'standard';

export interface GraphLayoutOptions {
  /** Omitted preserves the persisted layout's original sizing contract. */
  viewMode?: CanvasViewMode;
  nodeWidth?: number;
  columnGap?: number;
  rowGap?: number;
}
