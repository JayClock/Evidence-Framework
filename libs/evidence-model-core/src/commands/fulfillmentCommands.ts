import {
  type AttributeAST,
  type DomainModelDocument,
  type EvidenceEntityAST,
  type RelationshipAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import { assertMandatoryTime } from './derivationCommands.js';
import { CreateEntityCommand } from './entityCommands.js';
import { CreateRelationshipCommand } from './relationshipCommands.js';
import { CreateRuleCommand } from './ruleCommands.js';
import {
  fail,
  requireContractContext,
  requireRoleBoundByContract,
  requireRootContract,
} from './guards.js';
import { CommandSequence } from './sequence.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

export interface FulfillmentMomentInput {
  id: string;
  label: string;
  /** Party Role that forms the moment; must be bound by the root Contract. */
  responsibleRoleRef: string;
  attributes: AttributeAST[];
  notes?: string;
}

export interface CreateFulfillmentPairInput {
  /** Contract Context that owns both moments. */
  contextRef: string;
  request: FulfillmentMomentInput;
  confirmation: FulfillmentMomentInput;
  /** Confirmation → request reference id. */
  referenceId?: string;
  /** Request → root Contract reference id; omitted when not wanted. */
  contractReferenceId?: string;
  ruleId?: string;
  /** Overrides the default completion expression. */
  completionExpression?: string;
}

export interface FulfillmentPairResult {
  request: EvidenceEntityAST;
  confirmation: EvidenceEntityAST;
  rule: RuleAST;
  reference: RelationshipAST;
  contractReference: RelationshipAST | null;
}

const DEFAULT_COMPLETION_EXPRESSION =
  'confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)';

/**
 * Creates one main fulfillment pair atomically: request, confirmation, the
 * reference that pairs them, an optional request → Contract reference and the
 * completion rule that decides the pair.
 *
 * Red lines enforced here: the Context must be a Contract Context with one root
 * Contract, every moment must be formed by a Party Role bound by that Contract,
 * and the mandated business-time attributes must already be modeled.
 */
export class CreateFulfillmentPairCommand
  implements ModelCommand<FulfillmentPairResult>
{
  readonly type = 'create-fulfillment-pair';

  constructor(private readonly input: CreateFulfillmentPairInput) {}

  apply(
    document: DomainModelDocument,
  ): ModelCommandOutcome<FulfillmentPairResult> {
    const context = requireContractContext(document, this.input.contextRef);
    const rootContract = requireRootContract(document, context.id);
    requireRoleBoundByContract(
      document,
      context.id,
      this.input.request.responsibleRoleRef,
    );
    requireRoleBoundByContract(
      document,
      context.id,
      this.input.confirmation.responsibleRoleRef,
    );

    if (this.input.request.id === this.input.confirmation.id) {
      fail('id.duplicate', 'request and confirmation must have distinct ids.');
    }

    const request: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_request',
      id: this.input.request.id,
      label: this.input.request.label,
      contextRef: context.id,
      responsibleRoleRef: this.input.request.responsibleRoleRef,
      attributes: this.input.request.attributes,
      ...(this.input.request.notes === undefined
        ? {}
        : { notes: this.input.request.notes }),
    };
    const confirmation: EvidenceEntityAST = {
      type: 'entity',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      id: this.input.confirmation.id,
      label: this.input.confirmation.label,
      contextRef: context.id,
      responsibleRoleRef: this.input.confirmation.responsibleRoleRef,
      attributes: this.input.confirmation.attributes,
      ...(this.input.confirmation.notes === undefined
        ? {}
        : { notes: this.input.confirmation.notes }),
    };

    assertMandatoryTime('request', request);
    assertMandatoryTime('confirmation', confirmation);

    const reference: RelationshipAST = {
      type: 'relationship',
      id: this.input.referenceId ?? `relation.${request.id}-confirmed-by`,
      kind: 'references',
      sourceRef: confirmation.id,
      targetRef: request.id,
      label: '确认引用所属请求',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 1, max: 1 },
    };
    const contractReference: RelationshipAST | null =
      this.input.contractReferenceId === undefined
        ? null
        : {
            type: 'relationship',
            id: this.input.contractReferenceId,
            kind: 'references',
            sourceRef: request.id,
            targetRef: rootContract.id,
            label: '请求引用形成依据',
            sourceCardinality: { min: 1, max: 1 },
            targetCardinality: { min: 1, max: 1 },
          };
    const rule: RuleAST = {
      type: 'rule',
      id: this.input.ruleId ?? `rule.${request.id}-completed`,
      kind: 'completion',
      label: `${request.label}完成判断`,
      description: `${confirmation.label}在请求有效期内形成时，${request.label}履约完成。`,
      contextRef: context.id,
      bindings: {
        request: { ref: request.id },
        confirmations: { ref: confirmation.id, cardinality: 'many' },
      },
      expression:
        this.input.completionExpression ?? DEFAULT_COMPLETION_EXPRESSION,
      resultType: 'bool',
    };
    const commands = [
      new CreateEntityCommand(request),
      new CreateEntityCommand(confirmation),
      new CreateRelationshipCommand(reference),
      ...(contractReference === null
        ? []
        : [new CreateRelationshipCommand(contractReference)]),
      new CreateRuleCommand(rule),
    ];
    const outcome = new CommandSequence(commands, this.type).apply(document);

    return {
      document: outcome.document,
      inverse: outcome.inverse,
      affectedIds: outcome.affectedIds,
      result: { request, confirmation, rule, reference, contractReference },
    };
  }
}
