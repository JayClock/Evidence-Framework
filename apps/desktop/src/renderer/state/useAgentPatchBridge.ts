import { useEffect } from 'react';

import {
  decodeModelPatch,
  type ModelSession,
} from '@evidence-poc/evidence-model-core/browser';

/**
 * Applies agent patches through the live session.
 *
 * The renderer is the only place that holds the `ModelSession`, so the main
 * process asks it to dispatch; every agent edit therefore lands in the same
 * undo history as a human edit and is rejected by the same guards.
 */
export const useAgentPatchBridge = (session: ModelSession): void => {
  useEffect(
    () =>
      window.evidenceAPI.agent.onApplyPatch(({ requestId, patch }) => {
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
    [session],
  );
};
