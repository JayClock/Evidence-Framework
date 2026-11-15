import {
  type AttributeAST,
  type DomainModelDocument,
  type EvidenceEntityAST,
  type RelationshipAST,
  type RuleAST,
} from '@evidence-poc/evidence-schema';

import { assertMandatoryTime } from './derivationMutations.js';
import { createEntityMutator } from './entityMutations.js';
import { createRelationshipMutator } from './relationshipMutations.js';
import { createRuleMutator } from './ruleMutations.js';
import {
  fail,
  requireContractContext,
  requireRoleBoundByContract,
  requireRootContract,
} from './guards.js';
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

export const createFulfillmentPairMutator = (
  draft: DomainModelDocument,
  input: CreateFulfillmentPairInput,
): FulfillmentPairResult => {
  const context = requireContractContext(draft, input.contextRef);
  const rootContract = requireRootContract(draft, context.id);
  requireRoleBoundByContract(
    draft,
    context.id,
    input.request.responsibleRoleRef,
  );
  requireRoleBoundByContract(
    draft,
    context.id,
    input.confirmation.responsibleRoleRef,
  );

  if (input.request.id === input.confirmation.id) {
    fail('id.duplicate', 'request and confirmation must have distinct ids.');
  }

  const request: EvidenceEntityAST = {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_request',
    id: input.request.id,
    label: input.request.label,
    contextRef: context.id,
    responsibleRoleRef: input.request.responsibleRoleRef,
    attributes: input.request.attributes,
    ...(input.request.notes === undefined
      ? {}
      : { notes: input.request.notes }),
  };
  const confirmation: EvidenceEntityAST = {
    type: 'entity',
    category: 'evidence',
    kind: 'fulfillment_confirmation',
    id: input.confirmation.id,
    label: input.confirmation.label,
    contextRef: context.id,
    responsibleRoleRef: input.confirmation.responsibleRoleRef,
    attributes: input.confirmation.attributes,
    ...(input.confirmation.notes === undefined
      ? {}
      : { notes: input.confirmation.notes }),
  };

  assertMandatoryTime('request', request);
  assertMandatoryTime('confirmation', confirmation);

  const reference: RelationshipAST = {
    type: 'relationship',
    id: input.referenceId ?? `relation.${request.id}-confirmed-by`,
    kind: 'references',
    sourceRef: confirmation.id,
    targetRef: request.id,
    label: '确认引用所属请求',
    sourceCardinality: { min: 1, max: 1 },
    targetCardinality: { min: 1, max: 1 },
  };
  const contractReference: RelationshipAST | null =
    input.contractReferenceId === undefined
      ? null
      : {
          type: 'relationship',
          id: input.contractReferenceId,
          kind: 'references',
          sourceRef: request.id,
          targetRef: rootContract.id,
          label: '请求引用形成依据',
          sourceCardinality: { min: 1, max: 1 },
          targetCardinality: { min: 1, max: 1 },
        };
  const rule: RuleAST = {
    type: 'rule',
    id: input.ruleId ?? `rule.${request.id}-completed`,
    kind: 'completion',
    label: `${request.label}完成判断`,
    description: `${confirmation.label}在请求有效期内形成时，${request.label}履约完成。`,
    contextRef: context.id,
    bindings: {
      request: { ref: request.id },
      confirmations: { ref: confirmation.id, cardinality: 'many' },
    },
    expression: input.completionExpression ?? DEFAULT_COMPLETION_EXPRESSION,
    resultType: 'bool',
  };
  createEntityMutator(draft, request);
  createEntityMutator(draft, confirmation);
  createRelationshipMutator(draft, reference);
  if (contractReference !== null)
    createRelationshipMutator(draft, contractReference);
  createRuleMutator(draft, rule);
  return { request, confirmation, rule, reference, contractReference };
};
