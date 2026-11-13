import type { ValueType } from './values.js';
import { isBindingCardinality, isValueType } from './values.js';
import {
  isVocabularyId,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/**
 * What a rule asserts, and whether its CEL result is a decision.
 *
 * Only a derivation writes an attribute; the other five kinds answer a yes/no
 * question, so `booleanResult` keeps the CEL result type beside the kind instead
 * of in a second list the validator has to trust.
 */
export interface RuleKindDefinition {
  readonly label: string;
  /** True when the CEL result must be a boolean decision. */
  readonly booleanResult: boolean;
}

export const RULE_KIND_DEFINITIONS = {
  derivation: { label: '派生规则（Derivation）', booleanResult: false },
  precondition: { label: '前置条件（Precondition）', booleanResult: true },
  invariant: { label: '不变量（Invariant）', booleanResult: true },
  eligibility: { label: '资格判定（Eligibility）', booleanResult: true },
  completion: { label: '完成判定（Completion）', booleanResult: true },
  breach: { label: '违约判定（Breach）', booleanResult: true },
} as const satisfies Record<string, RuleKindDefinition>;

export type RuleKind = keyof typeof RULE_KIND_DEFINITIONS;

export const RULE_KINDS = vocabularyIds(RULE_KIND_DEFINITIONS);

export const RULE_KIND_LABELS = vocabularyLabels(RULE_KIND_DEFINITIONS);

/** Rule kinds whose CEL result must be a boolean decision. */
export const BOOLEAN_RULE_KINDS: readonly RuleKind[] = RULE_KINDS.filter(
  (kind) => RULE_KIND_DEFINITIONS[kind].booleanResult,
);

/** Binding of a CEL alias to a modeled instance or a runtime value type. */
export type RuleBinding =
  | { ref: string; cardinality?: 'one' | 'many' }
  | { type: ValueType };

/** Attribute that a derivation rule writes, with its model identity. */
export interface RuleTarget {
  entityRef: string;
  attribute: string;
}

export interface RuleAST {
  type: 'rule';
  id: string;
  kind: RuleKind;
  label: string;
  /** Business-language explanation; canonical Chinese（English） naming. */
  description: string;
  contextRef: string;
  bindings: Record<string, RuleBinding>;
  expression: string;
  resultType: ValueType;
  target?: RuleTarget;
  notes?: string;
}

export function isRuleKind(value: unknown): value is RuleKind {
  return isVocabularyId(RULE_KIND_DEFINITIONS, value);
}

export function isBooleanRuleKind(value: unknown): boolean {
  return isRuleKind(value) && RULE_KIND_DEFINITIONS[value].booleanResult;
}

const isDomainRef = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export function isRuleBinding(value: unknown): value is RuleBinding {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);

  if ('ref' in candidate) {
    return (
      isDomainRef(candidate.ref) &&
      (keys.length === 1 ||
        (keys.length === 2 && isBindingCardinality(candidate.cardinality)))
    );
  }

  return keys.length === 1 && isValueType(candidate.type);
}

/** A derivation rule is the only rule kind allowed to write an attribute. */
export function isDerivationRule(rule: RuleAST | undefined): boolean {
  return rule?.kind === 'derivation';
}

export function ruleTargetsAttribute(
  rule: RuleAST | undefined,
  entityRef: string,
  attribute: string,
): boolean {
  return (
    rule?.target?.entityRef === entityRef && rule.target.attribute === attribute
  );
}
