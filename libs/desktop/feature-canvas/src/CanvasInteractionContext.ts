import { createContext, useContext } from 'react';

import type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';
import type { CanvasEvidenceInquiry } from './EvidenceInquiryPopover';

export interface CanvasInteraction {
  viewMode: CanvasViewMode;
  onHoverNode: (nodeId: string | null) => void;
  onHoverContext: (contextId: string | null) => void;
  onHoverEdge: (edgeId: string | null) => void;
  evidenceInquiry?: CanvasEvidenceInquiry;
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
