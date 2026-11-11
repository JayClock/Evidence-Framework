import { useMemo } from 'react';

import { createGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import {
  createDomainGraph,
  type ModelDiff,
} from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { BranchOverlay, OverlayChange } from '../components/canvas/CanvasStage';

/**
 * Builds the canvas overlay for one comparison.
 *
 * The active layout is never recomputed here: ghosts come from the compared
 * branch's own layout so a new object appears where that branch would draw it,
 * and marks only recolour objects the checkout already shows.
 */
export const buildBranchOverlay = ({
  diff,
  targetDocument,
}: {
  diff: ModelDiff;
  targetDocument: DomainModelDocument;
}): BranchOverlay => {
  const marks = new Map<string, OverlayChange>();

  for (const entity of [...diff.contexts, ...diff.entities]) {
    if (entity.changeType === 'removed') {
      marks.set(entity.id, 'removed');
    } else if (entity.changeType === 'modified') {
      marks.set(entity.id, 'modified');
    }
  }

  const addedIds = new Set(
    [...diff.contexts, ...diff.entities]
      .filter((entity) => entity.changeType === 'added')
      .map((entity) => entity.id),
  );

  if (addedIds.size === 0) {
    return { marks, ghosts: [] };
  }

  const targetLayout = createGraphLayout(createDomainGraph(targetDocument));

  return {
    marks,
    ghosts: targetLayout.nodes.filter((node) => addedIds.has(node.nodeId)),
  };
};

/** Memoised variant so the canvas does not relayout on every keystroke. */
export const useBranchOverlay = (
  diff: ModelDiff | null,
  targetDocument: DomainModelDocument | null,
): BranchOverlay | null =>
  useMemo(() => {
    if (diff === null || targetDocument === null) {
      return null;
    }

    return buildBranchOverlay({ diff, targetDocument });
  }, [diff, targetDocument]);
