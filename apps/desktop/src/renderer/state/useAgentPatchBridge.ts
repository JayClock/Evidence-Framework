import { useEffect } from 'react';

import {
  decodeModelPatch,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** One agent patch that actually reached the model. */
export interface AppliedPatch {
  rationale: string;
  /** Command types, for the review bar and the activity stream. */
  commands: readonly string[];
  /** Model before the dispatch; the review baseline. */
  before: DomainModelDocument;
  /** Model after the dispatch; the document the canvas now shows. */
  after: DomainModelDocument;
}

/**
 * Applies agent patches through the live session.
 *
 * The renderer is the only place that holds the `ModelSession`, so the main
 * process asks it to dispatch; every agent edit therefore lands in the same
 * undo history as a human edit and is rejected by the same guards.
 *
 * `onApplied` receives both snapshots so the caller can show what changed and
 * offer one-step revert while the patch is still the newest edit.
 */
export const useAgentPatchBridge = (
  session: ModelSession,
  onApplied?: (patch: AppliedPatch) => void,
): void => {
  useEffect(
    () =>
      window.evidenceAPI.agent.onApplyPatch(({ requestId, patch }) => {
        const before = session.getDocument();

        try {
          const commands = decodeModelPatch(patch.commands);

          session.dispatchAll(commands, `agent:${patch.rationale}`);

          window.evidenceAPI.agent.respondPatch({
            requestId,
            result: {
              success: true,
              appliedCommands: commands.map((command) => command.type),
            },
          });
          onApplied?.({
            rationale: patch.rationale,
            commands: commands.map((command) => command.type),
            before,
            after: session.getDocument(),
          });
        } catch (error) {
          window.evidenceAPI.agent.respondPatch({
            requestId,
            result: {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : '补丁无法应用到当前模型。',
            },
          });
        }
      }),
    [session, onApplied],
  );
};
