import type { DomainGraph } from '@evidence-poc/evidence-model-core';

import type { DomainGraphLayout } from '../layout/types.js';

export interface HighlightInput {
  graph: DomainGraph;
  layout: DomainGraphLayout;
  /** Hovered or keyboard-focused business object. */
  activeNodeId?: string | null;
  activeEdgeId?: string | null;
  activeContextId?: string | null;
}

export interface HighlightResult {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
  contextIds: ReadonlySet<string>;
  /** True when the renderer should apply the dim mask. */
  dimmed: boolean;
  activeNodeId: string | null;
  activeEdgeId: string | null;
  activeContextId: string | null;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

export const emptyHighlight = (): HighlightResult => ({
  nodeIds: EMPTY,
  edgeIds: EMPTY,
  contextIds: EMPTY,
  dimmed: false,
  activeNodeId: null,
  activeEdgeId: null,
  activeContextId: null,
});

const contextChain = (
  graph: DomainGraph,
  contextId: string | null | undefined,
): string[] =>
  contextId === null || contextId === undefined
    ? []
    : graph.contextPath(contextId).map(({ id }) => id);

/**
 * "Current object + one hop" highlight from `visual-review.md`.
 *
 * - a node emphasises itself, its formal neighbours, the edges that touch it,
 *   its context and that context's ancestors;
 * - an edge emphasises the line and both endpoints;
 * - a context emphasises its boundary, every object it owns (including child
 *   contexts) and the edges with both endpoints inside it.
 *
 * Never expands past one hop, so hovering never redraws the whole model.
 */
export const computeHighlight = ({
  graph,
  layout,
  activeNodeId = null,
  activeEdgeId = null,
  activeContextId = null,
}: HighlightInput): HighlightResult => {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const contextIds = new Set<string>();

  if (activeNodeId !== null) {
    const node = layout.nodeById.get(activeNodeId);

    if (node === undefined) {
      return {
        ...emptyHighlight(),
        activeNodeId,
      };
    }

    nodeIds.add(activeNodeId);

    for (const contextId of contextChain(graph, node.contextId)) {
      contextIds.add(contextId);
    }

    for (const relationship of [
      ...graph.outgoing(activeNodeId),
      ...graph.incoming(activeNodeId),
    ]) {
      if (!layout.edgeById.has(relationship.id)) {
        continue;
      }

      edgeIds.add(relationship.id);
      nodeIds.add(
        relationship.sourceRef === activeNodeId
          ? relationship.targetRef
          : relationship.sourceRef,
      );
    }

    for (const link of layout.responsibilityLinks) {
      if (link.roleId === activeNodeId) {
        nodeIds.add(link.sourceRef);
      } else if (link.sourceRef === activeNodeId) {
        nodeIds.add(link.roleId);
      }
    }

    return {
      nodeIds,
      edgeIds,
      contextIds,
      dimmed: true,
      activeNodeId,
      activeEdgeId: null,
      activeContextId: null,
    };
  }

  if (activeEdgeId !== null) {
    const edge = layout.edgeById.get(activeEdgeId);

    if (edge === undefined) {
      return { ...emptyHighlight(), activeEdgeId };
    }

    edgeIds.add(edge.relationshipId);
    nodeIds.add(edge.sourceRef);
    nodeIds.add(edge.targetRef);

    for (const endpoint of [edge.sourceRef, edge.targetRef]) {
      const contextId =
        layout.nodeById.get(endpoint)?.contextId ??
        layout.contextGroupById.get(endpoint)?.contextId;

      for (const id of contextChain(graph, contextId)) {
        contextIds.add(id);
      }
    }

    return {
      nodeIds,
      edgeIds,
      contextIds,
      dimmed: true,
      activeNodeId: null,
      activeEdgeId,
      activeContextId: null,
    };
  }

  if (activeContextId !== null) {
    const group = layout.contextGroupById.get(activeContextId);

    if (group === undefined) {
      return { ...emptyHighlight(), activeContextId };
    }

    const contextQueue = [activeContextId];
    const visitedContexts = new Set<string>();

    while (contextQueue.length > 0) {
      const contextId = contextQueue.shift()!;

      if (visitedContexts.has(contextId)) {
        continue;
      }

      visitedContexts.add(contextId);
      contextIds.add(contextId);

      const current = layout.contextGroupById.get(contextId);
      contextQueue.push(...(current?.childContextIds ?? []));

      for (const nodeId of current?.nodeIds ?? []) {
        nodeIds.add(nodeId);
      }
    }

    for (const edge of layout.edges) {
      if (nodeIds.has(edge.sourceRef) && nodeIds.has(edge.targetRef)) {
        edgeIds.add(edge.relationshipId);
      }
    }

    return {
      nodeIds,
      edgeIds,
      contextIds,
      dimmed: true,
      activeNodeId: null,
      activeEdgeId: null,
      activeContextId,
    };
  }

  return emptyHighlight();
};

export const isNodeDimmed = (
  highlight: HighlightResult,
  nodeId: string,
): boolean => highlight.dimmed && !highlight.nodeIds.has(nodeId);

export const isEdgeDimmed = (
  highlight: HighlightResult,
  edgeId: string,
): boolean => highlight.dimmed && !highlight.edgeIds.has(edgeId);

export const isContextDimmed = (
  highlight: HighlightResult,
  contextId: string,
): boolean => highlight.dimmed && !highlight.contextIds.has(contextId);
