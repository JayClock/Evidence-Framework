import { boundsOfRects, type Rect } from '../geometry.js';
import type { DomainGraphLayout } from '../layout/types.js';

export interface ContextScope {
  contextId: string;
  /** The selected Context and every nested Context, never its siblings. */
  subtreeContextIds: ReadonlySet<string>;
  /** Core objects plus explicit one-hop neighbours, including free participants. */
  nodeIds: ReadonlySet<string>;
  /** Frames needed to understand the core and neighbour objects. */
  contextIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
  /** The selected frame plus neighbour boxes, without unrelated ancestor space. */
  bounds: Rect;
}

/** A mask over the canonical placement, not a second filtered layout. */
export const computeContextScope = (
  layout: DomainGraphLayout,
  contextId: string | null,
): ContextScope | null => {
  const selected =
    contextId === null ? undefined : layout.contextGroupById.get(contextId);
  if (!selected) return null;

  const subtreeContextIds = new Set<string>();
  const pending = [selected.contextId];
  while (pending.length) {
    const id = pending.pop()!;
    if (subtreeContextIds.has(id)) continue;
    subtreeContextIds.add(id);
    pending.push(...(layout.contextGroupById.get(id)?.childContextIds ?? []));
  }
  const coreNodeIds = new Set(
    layout.nodes
      .filter(
        (node) =>
          node.contextId !== null && subtreeContextIds.has(node.contextId),
      )
      .map((node) => node.nodeId),
  );
  const nodeIds = new Set(coreNodeIds);
  const contextIds = new Set(subtreeContextIds);
  const edgeIds = new Set<string>();
  const neighbourFrames: Rect[] = [];
  const isCore = (ref: string) =>
    coreNodeIds.has(ref) || subtreeContextIds.has(ref);
  const include = (ref: string) => {
    const node = layout.nodeById.get(ref);
    if (node) nodeIds.add(ref);
    const group = layout.contextGroupById.get(ref);
    if (group) {
      contextIds.add(ref);
      if (!subtreeContextIds.has(ref)) neighbourFrames.push(group.box);
    }
  };

  for (const edge of layout.edges) {
    if (!isCore(edge.sourceRef) && !isCore(edge.targetRef)) continue;
    edgeIds.add(edge.relationshipId);
    include(edge.sourceRef);
    include(edge.targetRef);
  }
  for (const link of layout.responsibilityLinks) {
    if (!isCore(link.sourceRef) && !isCore(link.roleId)) continue;
    include(link.sourceRef);
    include(link.roleId);
  }

  // Keep owners/ancestors as frames only. Their other objects must not become
  // neighbours just because one object inside that frame is relevant.
  const includeAncestors = (id: string | null) => {
    const seen = new Set<string>();
    while (id !== null && !seen.has(id)) {
      seen.add(id);
      contextIds.add(id);
      id = layout.contextGroupById.get(id)?.parentContextId ?? null;
    }
  };
  for (const id of nodeIds)
    includeAncestors(layout.nodeById.get(id)?.contextId ?? null);
  for (const id of [...contextIds]) includeAncestors(id);

  return {
    contextId: selected.contextId,
    subtreeContextIds,
    nodeIds,
    contextIds,
    edgeIds,
    bounds: boundsOfRects([
      selected.box,
      ...neighbourFrames,
      ...layout.nodes
        .filter(
          (node) => nodeIds.has(node.nodeId) && !coreNodeIds.has(node.nodeId),
        )
        .map((node) => node.box),
    ])!,
  };
};
