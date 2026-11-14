import { useMemo } from 'react';

import {
  collectCelCandidates,
  type CelCandidate,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';

/**
 * Resolves the candidate pool for one attribute's derivation rule.
 *
 * Rendered from the graph instead of from free text: a derivation may only read
 * modeled attributes, so the completion list is the model itself.
 */
export const useCelCompletion = ({
  graph,
  entityRef,
  ruleId,
}: {
  graph: DomainGraph;
  entityRef: string;
  ruleId?: string;
}): readonly CelCandidate[] =>
  useMemo(
    () =>
      collectCelCandidates({
        graph,
        entityRef,
        ...(ruleId === undefined ? {} : { ruleId }),
      }),
    [graph, entityRef, ruleId],
  );
