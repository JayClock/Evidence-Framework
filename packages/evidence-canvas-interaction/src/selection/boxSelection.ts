import {
  rectContainsPoint,
  rectsIntersect,
  type Point,
  type Rect,
} from '../geometry.js';
import type { DomainGraphLayout } from '../layout/types.js';

export interface BoxSelectionOptions {
  /**
   * Skip nodes whose box is smaller than this on either axis, so a stray click
   * drag does not select everything.
   */
  minimumSize?: number;
}

/** Business object ids whose box intersects the marquee. */
export const selectNodesInBox = (
  layout: DomainGraphLayout,
  marquee: Rect,
  options: BoxSelectionOptions = {},
): string[] => {
  const minimumSize = options.minimumSize ?? 0;

  if (marquee.width < minimumSize || marquee.height < minimumSize) {
    return [];
  }

  return layout.nodes
    .filter((node) => rectsIntersect(node.box, marquee))
    .map((node) => node.nodeId);
};

/** Context ids whose card intersects the marquee, outermost first. */
export const selectContextsInBox = (
  layout: DomainGraphLayout,
  marquee: Rect,
): string[] =>
  layout.contextGroups
    .filter((group) => rectsIntersect(group.box, marquee))
    .sort((left, right) => left.depth - right.depth)
    .map((group) => group.contextId);

export interface LayoutHit {
  nodeId: string | null;
  /** Innermost Context containing the point. */
  contextId: string | null;
}

/** Pointer hit test: objects win over the Context background they sit on. */
export const hitTestLayout = (
  layout: DomainGraphLayout,
  point: Point,
): LayoutHit => {
  let nodeId: string | null = null;

  for (let index = layout.nodes.length - 1; index >= 0; index -= 1) {
    const node = layout.nodes[index]!;

    if (rectContainsPoint(node.box, point)) {
      nodeId = node.nodeId;
      break;
    }
  }

  let contextId: string | null = null;
  let depth = -1;

  for (const group of layout.contextGroups) {
    if (group.depth > depth && rectContainsPoint(group.box, point)) {
      contextId = group.contextId;
      depth = group.depth;
    }
  }

  return { nodeId, contextId };
};
