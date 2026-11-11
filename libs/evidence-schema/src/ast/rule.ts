import type { ValueType } from './values.js';
import { isBindingCardinality, isValueType } from './values.js';

export const RULE_KINDS = [
  'derivation',
  'precondition',
  'invariant',
  'eligibility',
  'completion',
  'breach',
] as const;

export type RuleKind = (typeof RULE_KINDS)[number];

/** Rule kinds whose CEL result must be a boolean decision. */
export const BOOLEAN_RULE_KINDS: readonly RuleKind[] = [
  'precondition',
  'invariant',
  'eligibility',
  'completion',
  'breach',
];

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
  return (
    typeof value === 'string' && (RULE_KINDS as readonly string[]).includes(value)
  );
}

export function isBooleanRuleKind(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (BOOLEAN_RULE_KINDS as readonly string[]).includes(value)
  );
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
        (keys.length === 2 &&
          isBindingCardinality(candidate.cardinality)))
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
