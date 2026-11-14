import { Position, type Edge, type Node, type NodeHandle } from '@xyflow/react';

import type {
  ContextScope,
  DomainGraphLayout,
  LayoutEdge,
  LayoutNode,
} from '@evidence-poc/evidence-canvas-interaction';
import type { ModelSelection } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { SensorSeverity } from '@evidence-poc/evidence-agent/browser';

import type { CardSummary } from './cardSummary';
import type { ModelOverlay } from './canvasOverlay';
import type { DiagnosticIndex } from './diagnosticIndex';

/** A business object placed inside its Context, drawn by `NodeCard`. */
export interface EntityNodeData extends Record<string, unknown> {
  /** The placed object, with its position folded to the node's own origin. */
  node: LayoutNode;
  /** Precomputed so the card does not scan the document while panning. */
  summary: CardSummary;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  outOfScope: boolean;
}

/** A Context's boundary and title. */
export interface ContextNodeData extends Record<string, unknown> {
  contextId: string;
  label: string;
  kind: 'contract' | 'domain' | 'support';
  highlighted: boolean;
  dimmed: boolean;
  outOfScope: boolean;
}

/** One routed relationship, drawn as the polyline the layout computed. */
export interface FulfillmentEdgeData extends Record<string, unknown> {
  edge: LayoutEdge;
  label: string;
  cardinality: {
    source?: { min: number; max: number | 'many' };
    target?: { min: number; max: number | 'many' };
  };
  highlighted: boolean;
  hovered: boolean;
  dimmed: boolean;
  outOfScope: boolean;
  /** The compact reading hides `plays_role` routes until one is pointed at. */
  muted: boolean;
  diagnosticSeverity: SensorSeverity | null;
}

/** The dashed link that states one request is discharged by one result. */
export interface PairLinkEdgeData extends Record<string, unknown> {
  points: string;
  outOfScope: boolean;
}

export type EntityFlowNode = Node<EntityNodeData, 'entityNode'>;
export type ContextFlowNode = Node<ContextNodeData, 'contextGroup'>;
export type FulfillmentFlowEdge = Edge<FulfillmentEdgeData, 'fulfillmentEdge'>;
export type PairLinkFlowEdge = Edge<PairLinkEdgeData, 'pairLink'>;
export type CanvasFlowNode = EntityFlowNode | ContextFlowNode;
export type CanvasFlowEdge = FulfillmentFlowEdge | PairLinkFlowEdge;

export interface ConvertLayoutInput {
  layout: DomainGraphLayout;
  document: DomainModelDocument;
  selection: ModelSelection;
  highlightedNodeIds: ReadonlySet<string>;
  highlightedEdgeIds: ReadonlySet<string>;
  highlightedContextIds: ReadonlySet<string>;
  dimmed: boolean;
  scope: ContextScope | null;
  overlay: ModelOverlay | null;
  diagnostics?: DiagnosticIndex;
  summaries: ReadonlyMap<string, CardSummary>;
  hoveredEdgeId: string | null;
  /** The card density the stage is reading at. */
  viewMode: 'simplified' | 'standard';
}

/**
 * The layout the algorithm produced, expressed as React Flow's vocabulary.
 *
 * Kept a pure function with one input object: the mapping is the part worth
 * testing — parent organisation, world coordinates, edge binding — and a hook
 * that also rendered would make it untestable without a DOM. Coordinates stay
 * in layout world space; a child node's position is folded to its Context's
 * origin because that is what `parentId` means to React Flow.
 */
export const convertLayoutToReactFlow = ({
  layout,
  document,
  selection,
  highlightedNodeIds,
  highlightedEdgeIds,
  highlightedContextIds,
  dimmed,
  scope,
  overlay,
  diagnostics,
  summaries,
  hoveredEdgeId,
  viewMode,
}: ConvertLayoutInput): {
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
} => {
  const groupBoxById = new Map(
    layout.contextGroups.map((group) => [group.contextId, group.box] as const),
  );

  const nodes: CanvasFlowNode[] = [];

  // Parents first: React Flow adopts a child only once its parent is known.
  for (const group of layout.contextGroups) {
    const highlighted = highlightedContextIds.has(group.contextId);
    const outOfScope = scope !== null && !scope.contextIds.has(group.contextId);

    nodes.push({
      id: group.contextId,
      type: 'contextGroup',
      position: { x: group.box.x, y: group.box.y },
      draggable: false,
      selectable: false,
      connectable: false,
      // Seed the size so the engine can place children and route edges before
      // it has measured anything; the layout already knows every box.
      initialWidth: group.box.width,
      initialHeight: group.box.height,
      style: {
        width: group.box.width,
        height: group.box.height,
        // Contexts are paper under the notes: the tint must not cover a card.
        zIndex: 0,
      },
      data: {
        contextId: group.contextId,
        label: group.entity.label,
        kind:
          group.entity.kind === 'contract'
            ? 'contract'
            : group.entity.kind === 'domain'
              ? 'domain'
              : 'support',
        highlighted,
        dimmed: dimmed && !highlighted,
        outOfScope,
      },
    });
  }

  for (const node of layout.nodes) {
    const origin =
      node.contextId === null ? null : groupBoxById.get(node.contextId);
    const entity = document.entities.find((item) => item.id === node.nodeId);
    const outOfScope = scope !== null && !scope.nodeIds.has(node.nodeId);
    const highlighted = highlightedNodeIds.has(node.nodeId);

    nodes.push({
      id: node.nodeId,
      type: 'entityNode',
      position: {
        x: node.box.x - (origin?.x ?? 0),
        y: node.box.y - (origin?.y ?? 0),
      },
      ...(origin === undefined || node.contextId === null
        ? {}
        : { parentId: node.contextId, extent: 'parent' as const }),
      draggable: false,
      connectable: false,
      selectable: !outOfScope,
      initialWidth: node.box.width,
      initialHeight: node.box.height,
      // Declared rather than measured: the routed polyline does not use the
      // anchors, but the engine needs them to consider the node connectable.
      handles: edgeHandles(node.box.width, node.box.height),
      style: {
        width: node.box.width,
        height: node.box.height,
        zIndex: 2,
      },
      // The card draws its own frame at the node's origin; the wrapper only
      // reserves the box so React Flow can measure it.
      data: {
        node: {
          ...node,
          box: { ...node.box, x: 0, y: 0 },
        },
        summary: summaries.get(node.nodeId) ??
          // A card summarised from nothing still has to render; the layout
          // builder summarises every placed node, so this is unreachable.
          {
            attributes: [],
            remainingAttributes: 0,
            keyDataCount: 0,
            rules: [],
            partyBadge: null,
            responsibility: null,
            responsibilityRef: null,
          },
        selected: selection.nodeId === node.nodeId,
        highlighted,
        dimmed: dimmed && !highlighted,
        outOfScope: outOfScope || entity === undefined,
      },
    });
  }

  const placed = new Set(layout.nodes.map((node) => node.nodeId));
  const relationshipById = new Map(
    document.relationships.map(
      (relationship) => [relationship.id, relationship] as const,
    ),
  );

  const edges: CanvasFlowEdge[] = [];

  for (const edge of layout.edges) {
    if (!placed.has(edge.sourceRef) || !placed.has(edge.targetRef)) continue;

    const relationship = relationshipById.get(edge.relationshipId);
    const severity = diagnostics?.get(edge.relationshipId)?.severity ?? null;
    const highlighted = highlightedEdgeIds.has(edge.relationshipId);
    const muted =
      viewMode === 'simplified' &&
      edge.kind === 'plays_role' &&
      edge.crossContextKind !== 'role_inversion' &&
      !highlighted &&
      hoveredEdgeId !== edge.relationshipId;

    edges.push({
      id: edge.relationshipId,
      type: 'fulfillmentEdge',
      source: edge.sourceRef,
      target: edge.targetRef,
      sourceHandle: 'source',
      targetHandle: 'target',
      selectable: false,
      focusable: false,
      data: {
        edge,
        label: relationship?.label ?? edge.label,
        cardinality: {
          ...(relationship?.sourceCardinality === undefined
            ? {}
            : { source: relationship.sourceCardinality }),
          ...(relationship?.targetCardinality === undefined
            ? {}
            : { target: relationship.targetCardinality }),
        },
        highlighted,
        hovered: hoveredEdgeId === edge.relationshipId,
        dimmed: dimmed && !highlighted,
        outOfScope: scope !== null && !scope.edgeIds.has(edge.relationshipId),
        muted,
        diagnosticSeverity: severity,
      },
    });
  }

  // A pair is a claim about delivery, not a modeled relationship: it gets its
  // own edge type so the graph can state it without inventing a relation.
  for (const group of layout.fulfillmentGroups) {
    const request = layout.nodeById.get(group.requestId);

    if (request === undefined) continue;

    for (const resultId of [...group.confirmationIds, ...group.proofIds]) {
      const result = layout.nodeById.get(resultId);

      if (result === undefined) continue;

      edges.push({
        id: `pair:${group.groupId}:${resultId}`,
        type: 'pairLink',
        source: group.requestId,
        target: resultId,
        sourceHandle: 'source',
        targetHandle: 'target',
        selectable: false,
        focusable: false,
        data: {
          points: pairLinkPoints(request, result),
          outOfScope:
            scope !== null &&
            (!scope.nodeIds.has(group.requestId) ||
              !scope.nodeIds.has(resultId)),
        },
      });
    }
  }

  return { nodes, edges };
};

/**
 * Request's right edge to result's left edge, stepped at the halfway point.
 *
 * Drawn from the boxes rather than from the route: a pair link says "same
 * obligation", while a `references` route says "this document cites that one",
 * and the two must not overlap into one line.
 */
const pairLinkPoints = (request: LayoutNode, result: LayoutNode): string => {
  const origin = {
    x: request.box.x + request.box.width,
    y: request.box.y + request.box.height / 2,
  };
  const target = {
    x: result.box.x,
    y: result.box.y + result.box.height / 2,
  };
  const midX = (origin.x + target.x) / 2;

  return [
    `${origin.x},${origin.y}`,
    `${midX},${origin.y}`,
    `${midX},${target.y}`,
    `${target.x},${target.y}`,
  ].join(' ');
};

/**
 * The two anchors an edge can attach to.
 *
 * Handwritten because the width and height are already known: letting the
 * engine measure them would leave every edge unrendered on the first paint and
 * in any environment without layout (tests, headless export).
 */
const edgeHandles = (width: number, height: number): NodeHandle[] => [
  {
    type: 'source',
    id: 'source',
    position: Position.Right,
    x: width,
    y: height / 2,
    width: 1,
    height: 1,
  },
  {
    type: 'target',
    id: 'target',
    position: Position.Left,
    x: 0,
    y: height / 2,
    width: 1,
    height: 1,
  },
];

/** Boxes the canvas must show after a layout or scope change. */
export const boundsOf = (
  layout: DomainGraphLayout,
  scope: ContextScope | null,
): { x: number; y: number; width: number; height: number } => {
  const bounds = scope?.bounds ?? layout.bounds;

  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
  };
};
