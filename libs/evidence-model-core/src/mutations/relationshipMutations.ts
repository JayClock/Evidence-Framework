import {
  type DomainModelDocument,
  type EntityAST,
  type RelationshipAST,
  type RelationshipFlowKind,
  RelationshipFlowKindSchema,
  entitySignature,
  isContextEntity,
  isEvidenceEntity,
} from '@evidence-poc/evidence-schema';

import { assertId, assertUniqueId, fail, requireEntity } from './guards.js';
const PLAYER_PAIRS: readonly string[] = [
  'participant.party>role.party',
  'participant.party>role.third_party',
  'participant.thing>role.domain',
];

const isMomentEvidence = (entity: EntityAST): boolean =>
  isEvidenceEntity(entity) &&
  (entity.kind === 'fulfillment_confirmation' ||
    entity.kind === 'other_evidence' ||
    entity.kind === 'contract');

/** Direction matrix for `plays_role`; mirrors the static validator. */
const assertPlaysRole = (source: EntityAST, target: EntityAST): void => {
  const pair = `${entitySignature(source)}>${entitySignature(target)}`;

  if (PLAYER_PAIRS.includes(pair)) {
    return;
  }

  if (isMomentEvidence(source) && entitySignature(target) === 'role.evidence') {
    return;
  }

  if (isContextEntity(source) && entitySignature(target) === 'role.context') {
    return;
  }

  fail('relationship.endpoint', `plays_role does not allow ${pair}.`);
};

const assertEndpoints = (
  document: DomainModelDocument,
  relationship: RelationshipAST,
): void => {
  const source = requireEntity(document, relationship.sourceRef);
  const target = requireEntity(document, relationship.targetRef);

  if (relationship.sourceRef === relationship.targetRef) {
    fail('relationship.self', 'self relationships are not allowed.');
  }

  const sourceSignature = entitySignature(source);
  const targetSignature = entitySignature(target);

  if (
    sourceSignature === 'evidence.contract' &&
    targetSignature === 'evidence.contract'
  ) {
    fail(
      'relationship.endpoint',
      'Contract must not connect directly to Contract.',
    );
  }

  if (relationship.kind === 'plays_role') {
    assertPlaysRole(source, target);
    return;
  }

  if (relationship.kind !== 'references') {
    fail('relationship.endpoint', 'unsupported relationship kind.');
  }
};

export const createRelationshipMutator = (
  draft: DomainModelDocument,
  relationship: RelationshipAST,
  index = draft.relationships.length,
): RelationshipAST => {
  assertId(relationship.id);
  assertUniqueId(draft, relationship.id);
  assertEndpoints(draft, relationship);
  draft.relationships.splice(Math.max(0, index), 0, relationship);
  return relationship;
};

export const setRelationshipFlowMutator = (
  draft: DomainModelDocument,
  relationshipId: string,
  flowKind: RelationshipFlowKind,
): void => {
  const edge = draft.relationships.find((item) => item.id === relationshipId);
  if (edge === undefined)
    fail('relationship.notFound', `unknown relationship '${relationshipId}'.`);
  if (
    !RelationshipFlowKindSchema.safeParse(flowKind).success ||
    (edge.kind !== 'references' && flowKind !== 'primary')
  ) {
    fail('relationship.flowKind', 'Only references can declare a breach flow.');
  }
  if (flowKind === 'primary') delete edge.flowKind;
  else edge.flowKind = flowKind;
};

export const deleteRelationshipMutator = (
  draft: DomainModelDocument,
  relationshipId: string,
): boolean => {
  const index = draft.relationships.findIndex(
    (relationship) => relationship.id === relationshipId,
  );
  if (index === -1)
    fail('relationship.notFound', `unknown relationship '${relationshipId}'.`);
  draft.relationships.splice(index, 1);
  return true;
};
