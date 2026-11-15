import type { ElkNode, LayoutOptions } from 'elkjs';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { CanvasViewMode } from '../layout/types.js';

const OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.nodeNode': '36',
  'elk.padding': '[top=60,left=24,bottom=24,right=24]',
  'elk.randomSeed': '1',
};

/** Match the card's density; ELK owns spacing, not card content measurement. */
export const measureNodeSize = (mode: CanvasViewMode) => ({
  width: mode === 'expanded' ? 240 : 220,
  height: mode === 'simplified' ? 82 : mode === 'expanded' ? 200 : 156,
});

// Internal ids cannot collide with ids authored in a document.
export const relationshipEdgeId = (id: string) => `relationship:${id}`;
export const pairEdgeId = (request: string, result: string) =>
  `pair:${JSON.stringify([request, result])}`;

/** Construct a fresh compound tree without changing the document or indexes. */
export const transformDomainGraphToElk = (
  graph: DomainGraph,
  viewMode: CanvasViewMode = 'standard',
): ElkNode => {
  const contexts = graph
    .entities()
    .filter((entity) => entity.category === 'context');
  const nodes = new Map<string, ElkNode>();
  for (const entity of graph.entities()) {
    nodes.set(
      entity.id,
      entity.category === 'context'
        ? {
            id: entity.id,
            children: [],
            // Empty Contexts are still meaningful boundaries.
            width: 260,
            height: 84,
            layoutOptions: OPTIONS,
          }
        : { id: entity.id, ...measureNodeSize(viewMode) },
    );
  }
  const contextIds = new Set(contexts.map(({ id }) => id));
  const parentOf = new Map<string, string>();
  for (const entity of graph.entities()) {
    const parent =
      entity.category === 'context'
        ? entity.parentContextRef
        : 'contextRef' in entity
          ? entity.contextRef
          : undefined;
    if (parent !== undefined && contextIds.has(parent))
      parentOf.set(entity.id, parent);
  }
  // Imported drafts can contain cycles. Reject them explicitly rather than
  // handing ELK a cyclic object tree or silently dropping the entire component.
  for (const context of contexts) {
    const seen = new Set<string>([context.id]);
    let parent = parentOf.get(context.id);
    while (parent !== undefined) {
      if (seen.has(parent))
        throw new Error(`Cyclic Context hierarchy: ${context.id}`);
      seen.add(parent);
      parent = parentOf.get(parent);
    }
  }
  const root: ElkNode = {
    id: '__evidence_layout_root__',
    layoutOptions: OPTIONS,
    children: [],
    edges: [],
  };
  // The synthetic root is not a business node; its id must also be unique.
  while (nodes.has(root.id)) root.id += '_';
  for (const [id, node] of nodes) {
    const parent = parentOf.get(id);
    (parent === undefined ? root.children! : nodes.get(parent)!.children!).push(
      node,
    );
  }
  const addEdge = (id: string, source: string, target: string) => {
    // Invalid references are reported by schema validation; they must not
    // prevent the valid part of a draft from being drawn.
    if (!nodes.has(source) || !nodes.has(target)) return;
    root.edges!.push({ id, sources: [source], targets: [target] });
  };
  for (const relationship of graph.relationships()) {
    addEdge(
      relationshipEdgeId(relationship.id),
      relationship.sourceRef,
      relationship.targetRef,
    );
  }
  for (const pair of graph.fulfillmentPairs()) {
    for (const result of [...pair.confirmations, ...pair.proofs]) {
      addEdge(
        pairEdgeId(pair.request.id, result.id),
        pair.request.id,
        result.id,
      );
    }
  }
  return root;
};
