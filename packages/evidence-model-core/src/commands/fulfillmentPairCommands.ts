import {
  type DomainModelDocument,
  type EvidenceEntityAST,
  type RelationshipAST,
  type RuleAST,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
} from '@evidence-poc/evidence-schema';

import { fail, requireContractContext, requireEntity } from './guards.js';
import { CreateRelationshipCommand } from './relationshipCommands.js';
import { CreateRuleCommand } from './ruleCommands.js';
import { CommandSequence } from './sequence.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

const DEFAULT_COMPLETION_EXPRESSION =
  'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)';

export interface PairFulfillmentInput {
  /** Request whose result side is being paired. */
  requestRef: string;
  /** Confirmation that decides the request; it must belong to the same Context. */
  confirmationRef: string;
  ruleId?: string;
  label?: string;
  description?: string;
  expression?: string;
  /** Reference id; the pair is one confirmation referencing one request. */
  referenceId?: string;
}

export interface PairFulfillmentResult {
  request: EvidenceEntityAST;
  confirmation: EvidenceEntityAST;
  rule: RuleAST;
  /** `null` when the confirmation already referenced the request. */
  reference: RelationshipAST | null;
}

const requirePairMembers = (
  document: DomainModelDocument,
  input: Pick<PairFulfillmentInput, 'requestRef' | 'confirmationRef'>,
): { request: EvidenceEntityAST; confirmation: EvidenceEntityAST } => {
  const request = requireEntity(document, input.requestRef);
  const confirmation = requireEntity(document, input.confirmationRef);

  if (!isFulfillmentRequest(request)) {
    fail(
      'context.responsibility',
      `'${request.id}' is not a fulfillment request.`,
    );
  }

  if (!isFulfillmentConfirmation(confirmation)) {
    fail(
      'context.responsibility',
      `'${confirmation.id}' is not a fulfillment confirmation; a supporting proof cannot close a request.`,
    );
  }

  if (request.contextRef !== confirmation.contextRef) {
    fail(
      'context.responsibility',
      'request and confirmation must belong to the same Contract Context.',
      [request.contextRef, confirmation.contextRef],
    );
  }

  requireContractContext(document, request.contextRef);

  return { request, confirmation };
};

const existingReference = (
  document: DomainModelDocument,
  requestRef: string,
  confirmationRef: string,
): RelationshipAST | undefined =>
  document.relationships.find(
    (relationship) =>
      relationship.sourceRef === confirmationRef &&
      relationship.targetRef === requestRef,
  );

/** True when a rule already decides this request's completion. */
export const completionRuleOf = (
  document: DomainModelDocument,
  requestRef: string,
): RuleAST | undefined =>
  document.rules.find(
    (rule) =>
      rule.kind === 'completion' &&
      Object.values(rule.bindings).some(
        (binding) => 'ref' in binding && binding.ref === requestRef,
      ),
  );

/**
 * Pairs one request with the confirmation that decides it.
 *
 * The confirmation must be a real `fulfillment_confirmation` in the same
 * Contract Context: the red line forbids presenting a supporting proof, or a
 * confirmation from another contract, as the result side of this request.
 */
export class PairFulfillmentCommand
  implements ModelCommand<PairFulfillmentResult>
{
  readonly type = 'pair-fulfillment';

  constructor(private readonly input: PairFulfillmentInput) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<PairFulfillmentResult> {
    const { request, confirmation } = requirePairMembers(document, this.input);
    const existingRule = completionRuleOf(document, request.id);

    if (existingRule !== undefined) {
      fail(
        'rule.duplicate',
        `request '${request.id}' is already decided by rule '${existingRule.id}'.`,
        [existingRule.id],
      );
    }

    const reference =
      existingReference(document, request.id, confirmation.id) ?? null;
    const rule: RuleAST = {
      type: 'rule',
      id: this.input.ruleId ?? `rule.${request.id}-completed`,
      kind: 'completion',
      label: this.input.label ?? `${request.label}完成判断`,
      description:
        this.input.description ??
        `${confirmation.label}在请求有效期内形成时，${request.label}履约完成。`,
      contextRef: request.contextRef,
      bindings: {
        request: { ref: request.id },
        confirmations: { ref: confirmation.id, cardinality: 'many' },
      },
      expression: this.input.expression ?? DEFAULT_COMPLETION_EXPRESSION,
      resultType: 'bool',
    };
    const createdReference: RelationshipAST = {
      type: 'relationship',
      id: this.input.referenceId ?? `relation.${confirmation.id}-references-${request.id}`,
      kind: 'references',
      sourceRef: confirmation.id,
      targetRef: request.id,
      label: '确认引用所属请求',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    };
    const sequence = new CommandSequence(
      [
        ...(reference === null
          ? [new CreateRelationshipCommand(createdReference)]
          : []),
        new CreateRuleCommand(rule),
      ],
      this.type,
    );
    const outcome = sequence.apply(document);

    return {
      document: outcome.document,
      inverse: outcome.inverse,
      affectedIds: [request.id, confirmation.id, rule.id],
      result: {
        request,
        confirmation,
        rule,
        reference: reference === null ? createdReference : null,
      },
    };
  }
}

export interface BindBreachRuleInput {
  requestRef: string;
  rule: Omit<RuleAST, 'type' | 'kind' | 'contextRef' | 'target'>;
}

/** True when a rule already states how the request is breached. */
export const breachRuleOf = (
  document: DomainModelDocument,
  requestRef: string,
): RuleAST | undefined =>
  document.rules.find(
    (rule) =>
      rule.kind === 'breach' &&
      Object.values(rule.bindings).some(
        (binding) => 'ref' in binding && binding.ref === requestRef,
      ),
  );

/**
 * Adds the breach condition of one request.
 *
 * A breach rule never declares a target and never invents the follow-up
 * evidence: the model keeps "what happens after the breach" as a separate,
 * explicit decision instead of an inferred flow.
 */
export class BindBreachRuleCommand implements ModelCommand<RuleAST> {
  readonly type = 'bind-breach-rule';

  constructor(private readonly input: BindBreachRuleInput) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<RuleAST> {
    const request = requireEntity(document, this.input.requestRef);

    if (!isFulfillmentRequest(request)) {
      fail(
        'context.responsibility',
        `'${request.id}' is not a fulfillment request.`,
      );
    }

    const existing = breachRuleOf(document, request.id);

    if (existing !== undefined) {
      fail(
        'rule.duplicate',
        `request '${request.id}' already declares breach rule '${existing.id}'.`,
        [existing.id],
      );
    }

    if (
      !Object.values(this.input.rule.bindings).some(
        (binding) => 'ref' in binding && binding.ref === request.id,
      )
    ) {
      fail(
        'rule.context',
        'a breach rule must bind the request it decides.',
        [request.id],
      );
    }

    const {
      id,
      label,
      description,
      bindings,
      expression,
      resultType,
      notes,
    } = this.input.rule;
    const rule: RuleAST = {
      type: 'rule',
      kind: 'breach',
      id,
      label,
      description,
      contextRef: request.contextRef,
      bindings,
      expression,
      resultType,
      ...(notes === undefined ? {} : { notes }),
    };

    return new CreateRuleCommand(rule).apply(document);
  }
}
