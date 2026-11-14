import { createContext, useContext } from 'react';

import type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';

/**
 * What a node needs from the surface it floats on.
 *
 * Hover and selection are gestures, not data: putting them in every node's data
 * would rebuild the whole graph on each pointer move and would make the layout
 * adapter untestable outside React. The context carries the two callbacks and
 * nothing else.
 */
export interface CanvasInteraction {
  viewMode: CanvasViewMode;
  onHoverNode: (nodeId: string | null) => void;
  onHoverContext: (contextId: string | null) => void;
  onHoverEdge: (edgeId: string | null) => void;
  onSelect: (nodeId: string) => void;
}

const CanvasInteractionContext = createContext<CanvasInteraction | null>(null);

export const CanvasInteractionProvider = CanvasInteractionContext.Provider;

export const useCanvasInteraction = (): CanvasInteraction => {
  const value = useContext(CanvasInteractionContext);

  if (value === null) {
    throw new Error('画布节点必须渲染在 CanvasInteractionProvider 内。');
  }

  return value;
};
