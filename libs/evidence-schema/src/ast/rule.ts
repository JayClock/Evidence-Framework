import { z } from 'zod';
import {
  AttributeNameSchema,
  CelVariableNameSchema,
  DomainIdSchema,
} from './id.js';
import { BindingCardinalitySchema, ValueTypeSchema } from './values.js';
import {
  isVocabularyId,
  vocabularyIds,
  vocabularyLabels,
} from '../vocabulary.js';

/** What a rule asserts and whether its result is a decision. */
export interface RuleKindDefinition {
  readonly label: string;
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
export const RuleKindSchema = z.enum(
  RULE_KINDS as unknown as [RuleKind, ...RuleKind[]],
);

export const BOOLEAN_RULE_KINDS: readonly RuleKind[] = RULE_KINDS.filter(
  (kind) => RULE_KIND_DEFINITIONS[kind].booleanResult,
);

export const RuleBindingSchema = z.union([
  z
    .object({
      ref: DomainIdSchema,
      cardinality: BindingCardinalitySchema.optional(),
    })
    .strict(),
  z.object({ type: ValueTypeSchema }).strict(),
]);
export type RuleBinding = z.infer<typeof RuleBindingSchema>;

export const RuleTargetSchema = z
  .object({
    entityRef: DomainIdSchema,
    attribute: AttributeNameSchema,
  })
  .strict();
export type RuleTarget = z.infer<typeof RuleTargetSchema>;

export const RuleASTSchema = z
  .object({
    type: z.literal('rule'),
    id: DomainIdSchema,
    kind: RuleKindSchema,
    label: z.string().min(1),
    description: z.string().min(1),
    contextRef: DomainIdSchema,
    bindings: z.record(RuleBindingSchema),
    expression: z.string().min(1),
    resultType: ValueTypeSchema,
    target: RuleTargetSchema.optional(),
    notes: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    for (const variable of Object.keys(rule.bindings)) {
      if (!CelVariableNameSchema.safeParse(variable).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bindings', variable],
          message: `binding alias '${variable}' must be a CEL identifier`,
          params: { validationCode: 'rule.shape' },
        });
      }
    }

    if (rule.kind === 'derivation' && rule.target === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message:
          'a derivation Rule must declare the target attribute it writes',
        params: { validationCode: 'rule.target.required' },
      });
    }

    if (rule.kind !== 'derivation' && rule.target !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target'],
        message: 'only a derivation Rule may define target',
        params: { validationCode: 'rule.target.forbidden' },
      });
    }

    if (
      RULE_KIND_DEFINITIONS[rule.kind].booleanResult &&
      rule.resultType !== 'bool'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultType'],
        message: `${rule.kind} Rule resultType must be bool`,
        params: { validationCode: 'rule.resultType' },
      });
    }
  });
export type RuleAST = z.infer<typeof RuleASTSchema>;

export function isRuleKind(value: unknown): value is RuleKind {
  return isVocabularyId(RULE_KIND_DEFINITIONS, value);
}

export function isBooleanRuleKind(value: unknown): boolean {
  return isRuleKind(value) && RULE_KIND_DEFINITIONS[value].booleanResult;
}

export function isRuleBinding(value: unknown): value is RuleBinding {
  return RuleBindingSchema.safeParse(value).success;
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
