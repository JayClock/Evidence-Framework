import {
  timeAttributeOf,
  type TimeRole,
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
  delete attribute.source;
  attribute.derivedByRuleRef = rule.id;
  return rule;
};

/** Attributes whose business time a modeled moment must declare. */
const fulfillmentTimeRoles = {
  request: ['start', 'deadline'],
  confirmation: ['occurrence'],
} as const satisfies Record<string, readonly TimeRole[]>;

export const assertMandatoryTime = (
  moment: keyof typeof fulfillmentTimeRoles,
  entity: Pick<EntityAST, 'id'> & { attributes?: EntityAST['attributes'] },
): void => {
  for (const role of fulfillmentTimeRoles[moment]) {
    const attribute = timeAttributeOf(entity, role);

    if (attribute === undefined) {
      fail(
        'attribute.time.missing',
        `${moment} '${entity.id}' requires business time role '${role}'.`,
      );
    }

    if (
      attribute.valueType !== 'timestamp' ||
      attribute.required !== true ||
      attribute.keyData !== true
    ) {
      fail(
        'attribute.time.missing',
        `${moment} '${entity.id}' attribute '${attribute.name}' must be a required keyData timestamp.`,
      );
    }
  }
};
