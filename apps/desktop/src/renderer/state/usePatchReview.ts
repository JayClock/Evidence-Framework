import { useCallback, useMemo, useRef, useState } from 'react';

import {
  diffDomainModels,
  type ModelDiff,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { BranchOverlay, OverlayChange } from '../components/canvas/CanvasStage';
import type { AppliedPatch } from './useAgentPatchBridge';

/** What one applied agent patch changed, kept until the modeler decides. */
export interface PatchReview {
  rationale: string;
  commands: readonly string[];
  addedIds: readonly string[];
  removedIds: readonly string[];
  modifiedIds: readonly string[];
  /** Rings the canvas draws so the change is visible where it happened. */
  overlay: BranchOverlay;
  /**
   * True while the patched document is still the one on screen.
   *
   * A later human edit or a newer patch makes this false: reverting then would
   * discard work the reviewer did not ask to lose, so the bar offers no undo.
   */
  revertable: boolean;
}

export interface PatchReviewController {
  review: PatchReview | null;
  /** Records one applied patch as the pending review. */
  record: (patch: AppliedPatch) => void;
  /** Keeps the patch and closes the review. */
  accept: () => void;
  /** Undoes the patch when it is still the newest edit, then closes. */
  revert: () => void;
}

const overlayFor = (diff: ModelDiff): BranchOverlay => {
  const marks = new Map<string, OverlayChange>();

  for (const entity of [...diff.contexts, ...diff.entities]) {
    if (entity.changeType !== 'unchanged') {
      marks.set(entity.id, entity.changeType);
    }
  }

  return { marks, ghosts: [], scope: 'patch' };
};

const idsWith = (diff: ModelDiff, change: 'added' | 'removed' | 'modified') =>
  [...diff.contexts, ...diff.entities]
    .filter((entity) => entity.changeType === change)
    .map((entity) => entity.id);

/**
 * Turns an applied patch into a review the modeler can still refuse.
 *
 * The patch is already in the model and in the undo history, because the agent
 * needs an answer inside the tool call. What the review adds is the honest
 * follow-up: these objects changed, and one keystroke puts them back.
 */
export const usePatchReview = (
  session: ModelSession,
  document: DomainModelDocument,
): PatchReviewController => {
  const [pending, setPending] = useState<AppliedPatch | null>(null);
  const patchedRef = useRef<DomainModelDocument | null>(null);

  const record = useCallback((patch: AppliedPatch) => {
    patchedRef.current = patch.after;
    setPending(patch);
  }, []);

  const accept = useCallback(() => {
    patchedRef.current = null;
    setPending(null);
  }, []);

  const revert = useCallback(() => {
    const patched = patchedRef.current;

    patchedRef.current = null;
    setPending(null);

    // Only the newest edit is safe to take back. If anything landed on top, the
    // modeler keeps their work and the bar simply closes.
    if (patched !== null && session.getDocument() === patched) {
      session.undo();
    }
  }, [session]);

  const review = useMemo<PatchReview | null>(() => {
    if (pending === null) {
      return null;
    }

    const diff = diffDomainModels(pending.before, pending.after);

    return {
      rationale: pending.rationale,
      commands: pending.commands,
      addedIds: idsWith(diff, 'added'),
      removedIds: idsWith(diff, 'removed'),
      modifiedIds: idsWith(diff, 'modified'),
      overlay: overlayFor(diff),
      revertable: document === pending.after,
    };
  }, [document, pending]);

  return { review, record, accept, revert };
};
