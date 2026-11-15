import {
  type DomainModelDocument,
  type EntityAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import { createRuleMutator } from './ruleMutations.js';
import { fail, requireAttribute, requireEntity } from './guards.js';
export interface BindDerivedRuleInput {
  entityRef: string;
  attribute: string;
  rule: Omit<RuleAST, 'type' | 'kind' | 'contextRef' | 'target'>;
}

export const bindDerivedRuleMutator = (
  draft: DomainModelDocument,
  input: BindDerivedRuleInput,
): RuleAST => {
  const entity = requireEntity(draft, input.entityRef);
  const attribute = requireAttribute(entity, input.attribute);

  if (attribute.derivedByRuleRef !== undefined) {
    fail(
      'derivation.alreadyBound',
      `'${entity.id}.${attribute.name}' is already derived by '${attribute.derivedByRuleRef}'.`,
    );
  }

  const contextRef = 'contextRef' in entity ? entity.contextRef : undefined;

  if (contextRef === undefined) {
    fail(
      'rule.context',
      `entity '${entity.id}' has no Context, so it cannot own a derivation rule.`,
    );
  }

  const rule: RuleAST = {
    ...input.rule,
    type: 'rule',
    kind: 'derivation',
    contextRef,
    target: { entityRef: entity.id, attribute: attribute.name },
  };
  createRuleMutator(draft, rule);
  attribute.derivedByRuleRef = rule.id;
  return rule;
};

/** Attributes whose business time a modeled moment must declare. */
export const MANDATORY_MOMENT_TIME: Record<string, readonly string[]> = {
  request: ['started_at', 'expired_at'],
  confirmation: ['confirmed_at'],
};

export const assertMandatoryTime = (
  moment: string,
  entity: Pick<EntityAST, 'id'> & { attributes?: EntityAST['attributes'] },
): void => {
  for (const name of MANDATORY_MOMENT_TIME[moment] ?? []) {
    const attribute = entity.attributes?.find(
      (candidate) => candidate.name === name,
    );

    if (attribute === undefined) {
      fail(
        'attribute.time.missing',
        `${moment} '${entity.id}' requires explicit time attribute '${name}'.`,
      );
    }

    if (
      attribute.valueType !== 'timestamp' ||
      attribute.required !== true ||
      attribute.keyData !== true
    ) {
      fail(
        'attribute.time.missing',
        `${moment} '${entity.id}' attribute '${name}' must be a required keyData timestamp.`,
      );
    }
  }
};
