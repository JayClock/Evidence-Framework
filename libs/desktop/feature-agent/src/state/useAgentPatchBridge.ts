import type { EvidenceAgentApi } from '@evidence-poc/desktop-contracts/agentIpc';
import { useLayoutEffect } from 'react';

import type { ModelSession } from '@evidence-poc/evidence-model-core';
import {
  ModelPatchRequestSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

/** One agent patch that actually reached the model. */
export interface AppliedPatch {
  rationale: string;
  /** Patch operation names, for the review bar and activity stream. */
  commands: readonly string[];
  /** Model before the transaction; the review baseline. */
  before: DomainModelDocument;
  /** Model after the transaction; the document the canvas now shows. */
  after: DomainModelDocument;
}

/**
 * Applies agent patches through the live session.
 *
 * The renderer is the only place that holds the `ModelSession`, so the main
 * process asks it to apply patches; every edit lands in the same undo history
 * as a human edit, with syntax checks and the session's configured static guard.
 *
 * `onApplied` receives both snapshots so the caller can show what changed and
 * offer one-step revert while the patch is still the newest edit.
 */
export const useAgentPatchBridge = (
  api: Pick<EvidenceAgentApi, 'onApplyPatch' | 'respondPatch'>,
  session: ModelSession,
  onApplied?: (patch: AppliedPatch) => void,
): void => {
  useLayoutEffect(
    () =>
      api.onApplyPatch(({ requestId, patch }) => {
        const before = session.getDocument();

        try {
          const parsed = ModelPatchRequestSchema.parse(patch);
          const commands = parsed.patches.map((operation) => operation.op);
          session.applyPatchBatch(parsed.patches, `agent:${parsed.rationale}`);

          api.respondPatch({
            requestId,
            result: {
              success: true,
              appliedCommands: commands,
            },
          });
          const after = session.getDocument();
          if (after !== before) {
            onApplied?.({
              rationale: parsed.rationale,
              commands,
              before,
              after,
            });
          }
        } catch (error) {
          api.respondPatch({
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
    [api, session, onApplied],
  );
};
