import {
  type DomainModelDocument,
  type EntityAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import { CreateRuleCommand } from './ruleCommands.js';
import { UpdateEntityCommand } from './entityCommands.js';
import { CommandSequence } from './sequence.js';
import { fail, requireAttribute, requireEntity } from './guards.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

export interface BindDerivedRuleInput {
  entityRef: string;
  attribute: string;
  rule: Omit<RuleAST, 'type' | 'kind' | 'contextRef' | 'target'>;
}

/**
 * Creates a derivation rule and links the attribute it writes in one step.
 *
 * The link is symmetric on purpose: `attribute.derivedByRuleRef` and
 * `rule.target` must name each other, so a caller cannot save half of it.
 */
export class BindDerivedRuleCommand implements ModelCommand<RuleAST> {
  readonly type = 'bind-derived-rule';

  constructor(private readonly input: BindDerivedRuleInput) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<RuleAST> {
    const entity = requireEntity(document, this.input.entityRef);
    const attribute = requireAttribute(entity, this.input.attribute);

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
      ...this.input.rule,
      type: 'rule',
      kind: 'derivation',
      contextRef,
      target: { entityRef: entity.id, attribute: attribute.name },
    };
    const attributes = (entity.attributes ?? []).map((candidate) =>
      candidate.name === attribute.name
        ? { ...candidate, derivedByRuleRef: rule.id }
        : candidate,
    );
    const outcome = new CommandSequence(
      [
        new CreateRuleCommand(rule),
        new UpdateEntityCommand(entity.id, { attributes }),
      ],
      this.type,
    ).apply(document);

    return {
      document: outcome.document,
      inverse: outcome.inverse,
      affectedIds: [rule.id, entity.id],
      result: rule,
    };
  }
}

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
