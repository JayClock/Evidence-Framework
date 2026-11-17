import type { RelationshipFlowKind } from '@evidence-poc/evidence-schema';
import type { CanvasFlowEdge, CanvasFlowNode } from './useReactFlowAdapter';

/** Renderer-independent camera/highlight contract; no agent runtime in canvas. */
export interface CanvasStoryFocus {
  readonly activeEntityId: string;
  readonly dependencyEntityIds: readonly string[];
  readonly relatedEntityIds?: readonly string[];
  readonly activeRelationshipIds?: readonly string[];
  readonly flowKind?: RelationshipFlowKind;
  readonly triggeredRuleIds?: readonly string[];
  readonly activeValues?: Readonly<Record<string, unknown>>;
  /** Flow + example identity, including two steps on the same entity. */
  readonly focusKey: string;
}

/** Playback overrides hover/selection dimming without changing model geometry. */
export const applyStoryFocus = (
  canvas: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] },
  focus: CanvasStoryFocus | null,
): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } => {
  if (
    focus === null ||
    !canvas.nodes.some((node) => node.id === focus.activeEntityId)
  )
    return canvas;
  const involved = new Set([
    focus.activeEntityId,
    ...focus.dependencyEntityIds,
    ...(focus.relatedEntityIds ?? []),
  ]);
  const explicitEdges = new Set(focus.activeRelationshipIds ?? []);
  for (const edge of canvas.edges)
    if (
      edge.type === 'fulfillmentEdge' &&
      edge.data &&
      explicitEdges.has(edge.data.edge.relationshipId)
    ) {
      involved.add(edge.source);
      involved.add(edge.target);
    }
  const dependencies = new Set(focus.dependencyEntityIds);
  const byId = new Map(canvas.nodes.map((node) => [node.id, node]));
  const contexts = new Set<string>();
  for (const id of involved) {
    let parent = byId.get(id)?.parentId;
    while (parent && !contexts.has(parent)) {
      contexts.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  return {
    nodes: canvas.nodes.map((node): CanvasFlowNode => {
      const active = node.id === focus.activeEntityId;
      if (node.type === 'contextGroup')
        return {
          ...node,
          data: {
            ...node.data,
            highlighted: contexts.has(node.id),
            dimmed: false,
          },
        };
      return {
        ...node,
        className: active
          ? `evidence-story-active${focus.flowKind === 'breach_compensation' ? ' evidence-story-breach' : focus.flowKind === 'escalation' ? ' evidence-story-escalation' : ''}`
          : undefined,
        style: {
          ...node.style,
          opacity: involved.has(node.id) ? 1 : 0.35,
          transition: 'opacity 180ms ease',
        },
        data: {
          ...node.data,
          highlighted: involved.has(node.id),
          dimmed: false,
          storyValues: active ? focus.activeValues : undefined,
          triggeredRuleIds: involved.has(node.id)
            ? focus.triggeredRuleIds
            : undefined,
        },
      };
    }),
    edges: canvas.edges.map((edge): CanvasFlowEdge => {
      const modeledFlow =
        edge.type === 'fulfillmentEdge' ? edge.data?.edge.flowKind : undefined;
      const allowed =
        focus.flowKind === undefined ||
        modeledFlow === undefined ||
        modeledFlow === 'primary' ||
        modeledFlow === focus.flowKind;
      const active =
        allowed &&
        ((edge.type === 'fulfillmentEdge' &&
          edge.data &&
          explicitEdges.has(edge.data.edge.relationshipId)) ||
          (edge.source === focus.activeEntityId &&
            dependencies.has(edge.target)) ||
          (edge.target === focus.activeEntityId &&
            dependencies.has(edge.source)));
      const relevant =
        allowed && involved.has(edge.source) && involved.has(edge.target);
      const story = {
        storyActive: active,
        storyReversed: edge.source === focus.activeEntityId,
      };
      if (edge.type === 'fulfillmentEdge' && edge.data)
        return {
          ...edge,
          data: {
            ...edge.data,
            ...story,
            highlighted: relevant,
            dimmed: !relevant,
            muted: relevant ? false : edge.data.muted,
          },
        };
      if (edge.type === 'pairLink' && edge.data)
        return {
          ...edge,
          data: { ...edge.data, ...story, storyDimmed: !relevant },
        };
      return edge;
    }),
  };
};
