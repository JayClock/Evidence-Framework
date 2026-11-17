import type { CanvasFlowEdge, CanvasFlowNode } from './useReactFlowAdapter';

/** Renderer-independent camera/highlight contract; no agent runtime in canvas. */
export interface CanvasStoryFocus {
  readonly activeEntityId: string;
  readonly dependencyEntityIds: readonly string[];
  readonly relatedEntityIds?: readonly string[];
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
        className: active ? 'evidence-story-active' : undefined,
        style: {
          ...node.style,
          opacity: involved.has(node.id) ? 1 : 0.35,
          transition: 'opacity 180ms ease',
        },
        data: {
          ...node.data,
          highlighted: involved.has(node.id),
          dimmed: false,
        },
      };
    }),
    edges: canvas.edges.map((edge): CanvasFlowEdge => {
      const active =
        (edge.source === focus.activeEntityId &&
          dependencies.has(edge.target)) ||
        (edge.target === focus.activeEntityId && dependencies.has(edge.source));
      const relevant = involved.has(edge.source) && involved.has(edge.target);
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
