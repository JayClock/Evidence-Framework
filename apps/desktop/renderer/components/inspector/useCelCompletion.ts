import { useMemo } from 'react';

import {
  collectCelCandidates,
  type CelCandidate,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core/browser';

export interface CelSuggestion {
  /** Text shown in the list. */
  label: string;
  /** Business meaning rendered next to the label. */
  detail: string;
  /** Token inserted into the expression. */
  insert: string;
  kind: 'alias' | 'attribute';
}

export interface CelSuggestionResult {
  items: readonly CelSuggestion[];
  /** Offset the inserted token replaces. */
  replaceFrom: number;
}

const EMPTY: CelSuggestionResult = { items: [], replaceFrom: 0 };

const TOKEN_BEFORE_CARET = /([A-Za-z_][A-Za-z0-9_]*)?\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)?$/;
const WORD_BEFORE_CARET = /[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Suggests the aliases and attributes the caret may read.
 *
 * Pure so the editor and its tests share one implementation: the candidate pool
 * comes from the graph, never from a generic CEL vocabulary.
 */
export const computeCelSuggestions = ({
  expression,
  caret,
  candidates,
}: {
  expression: string;
  caret: number;
  candidates: readonly CelCandidate[];
}): CelSuggestionResult => {
  const before = expression.slice(0, caret);
  const member = TOKEN_BEFORE_CARET.exec(before);

  if (member !== null) {
    const alias = member[1];
    const prefix = member[2] ?? '';

    if (alias === undefined) {
      return EMPTY;
    }

    const candidate = candidates.find((item) => item.alias === alias);

    if (candidate === undefined) {
      return EMPTY;
    }

    return {
      items: candidate.attributes
        .filter((attribute) => attribute.name.startsWith(prefix))
        .map((attribute) => ({
          label: attribute.name,
          detail: `${attribute.label}${
            attribute.valueType === undefined ? '' : ` · ${attribute.valueType}`
          }`,
          insert: attribute.name,
          kind: 'attribute' as const,
        })),
      replaceFrom: caret - prefix.length,
    };
  }

  const word = WORD_BEFORE_CARET.exec(before);

  if (word === null) {
    return EMPTY;
  }

  const prefix = word[0];

  return {
    items: candidates
      .filter((candidate) => candidate.alias.startsWith(prefix))
      .map((candidate) => ({
        label: candidate.alias,
        detail: candidate.label,
        insert: candidate.alias,
        kind: 'alias' as const,
      })),
    replaceFrom: caret - prefix.length,
  };
};

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
