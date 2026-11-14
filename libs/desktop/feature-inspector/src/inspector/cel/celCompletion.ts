import type { CelCandidate } from '@evidence-poc/evidence-model-core';

/** One row the editor may insert, with the business meaning beside it. */
export interface CelCompletionOption {
  label: string;
  detail: string;
  insert: string;
  kind: 'alias' | 'attribute' | 'macro';
}

export interface CelCompletionResult {
  /** Offset the inserted token replaces. */
  from: number;
  options: readonly CelCompletionOption[];
}

const EMPTY: CelCompletionResult = { from: 0, options: [] };

const MEMBER_BEFORE_CARET =
  /([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)?$/;

const WORD_BEFORE_CARET = /[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The CEL collection macros, written the way they are called on a list.
 *
 * They are listed for every collection alias because a modeler who types
 * `confirmations.` is usually about to ask whether one of them happened, not
 * about to read an attribute of the list itself.
 */
const COLLECTION_MACROS: readonly CelCompletionOption[] = [
  {
    label: 'exists',
    detail: '宏：集合中至少有一个元素满足条件',
    insert: 'exists(c, c)',
    kind: 'macro',
  },
  {
    label: 'all',
    detail: '宏：集合中所有元素都满足条件',
    insert: 'all(c, c)',
    kind: 'macro',
  },
  {
    label: 'filter',
    detail: '宏：只保留满足条件的元素',
    insert: 'filter(c, c)',
    kind: 'macro',
  },
];

const attributeOptions = (
  candidate: CelCandidate,
  prefix: string,
): readonly CelCompletionOption[] =>
  candidate.attributes
    .filter((attribute) => attribute.name.startsWith(prefix))
    .map((attribute) => ({
      label: attribute.name,
      detail:
        attribute.valueType === undefined
          ? attribute.label
          : `${attribute.label} · ${attribute.valueType}`,
      insert: attribute.name,
      kind: 'attribute' as const,
    }));

/**
 * Suggests the aliases and attributes the caret may read.
 *
 * Pure so the editor and its tests share one implementation: the candidate pool
 * comes from the graph, never from a generic CEL vocabulary, because a rule may
 * only read attributes the model declares.
 */
export const computeCelCompletions = ({
  expression,
  caret,
  candidates,
  explicit = false,
}: {
  expression: string;
  caret: number;
  candidates: readonly CelCandidate[];
  /** True when the modeler asked for the list instead of typing into it. */
  explicit?: boolean;
}): CelCompletionResult => {
  const before = expression.slice(0, caret);
  const member = MEMBER_BEFORE_CARET.exec(before);

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

    const attributes = attributeOptions(candidate, prefix);
    const macros =
      candidate.cardinality === 'many'
        ? COLLECTION_MACROS.filter((macro) => macro.label.startsWith(prefix))
        : [];

    return {
      from: caret - prefix.length,
      options: [...macros, ...attributes],
    };
  }

  const word = WORD_BEFORE_CARET.exec(before);

  if (word === null && !explicit) {
    return EMPTY;
  }

  const prefix = word?.[0] ?? '';

  return {
    from: caret - prefix.length,
    options: [
      ...candidates
        .filter((candidate) => candidate.alias.startsWith(prefix))
        .map((candidate) => ({
          label: candidate.alias,
          detail:
            candidate.cardinality === 'many'
              ? `${candidate.label}（集合）`
              : candidate.label,
          insert: candidate.alias,
          kind: 'alias' as const,
        })),
      ...COLLECTION_MACROS.filter((macro) => macro.label.startsWith(prefix)),
    ],
  };
};
