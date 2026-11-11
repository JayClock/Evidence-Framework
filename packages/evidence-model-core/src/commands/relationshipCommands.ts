import {
  type DomainModelDocument,
  type EntityAST,
  type RelationshipAST,
  entitySignature,
  isContextEntity,
  isEvidenceEntity,
} from '@evidence-poc/evidence-schema';

import { assertId, assertUniqueId, fail, requireEntity } from './guards.js';
import type { ModelCommand, ModelCommandOutcome } from './types.js';

const withRelationship = (
  document: DomainModelDocument,
  relationship: RelationshipAST,
  index?: number,
): DomainModelDocument => {
  const relationships = [...document.relationships];

  if (index === undefined || index >= relationships.length) {
    relationships.push(relationship);
  } else {
    relationships.splice(index, 0, relationship);
  }

  return { ...document, relationships };
};

const PLAYER_PAIRS: readonly string[] = [
  'participant.party>role.party',
  'participant.party>role.third_party',
  'participant.thing>role.domain',
];

const isMomentEvidence = (entity: EntityAST): boolean =>
  isEvidenceEntity(entity) &&
  (entity.kind === 'fulfillment_confirmation' ||
    entity.kind === 'other_evidence');

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

  fail(
    'relationship.endpoint',
    `plays_role does not allow ${pair}.`,
  );
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

  if (sourceSignature === 'evidence.contract' && targetSignature === 'evidence.contract') {
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

export class CreateRelationshipCommand implements ModelCommand<RelationshipAST> {
  readonly type = 'create-relationship';

  constructor(
    private readonly relationship: RelationshipAST,
    private readonly index?: number,
  ) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<RelationshipAST> {
    assertId(this.relationship.id);
    assertUniqueId(document, this.relationship.id);
    assertEndpoints(document, this.relationship);

    return {
      document: withRelationship(document, this.relationship, this.index),
      inverse: new DeleteRelationshipCommand(this.relationship.id),
      affectedIds: [
        this.relationship.id,
        this.relationship.sourceRef,
        this.relationship.targetRef,
      ],
      result: this.relationship,
    };
  }
}

export class DeleteRelationshipCommand implements ModelCommand<boolean> {
  readonly type = 'delete-relationship';

  constructor(private readonly relationshipId: string) {}

  apply(document: DomainModelDocument): ModelCommandOutcome<boolean> {
    const relationship = document.relationships.find(
      (candidate) => candidate.id === this.relationshipId,
    );

    if (relationship === undefined) {
      fail('relationship.notFound', `unknown relationship '${this.relationshipId}'.`);
    }

    return {
      document: {
        ...document,
        relationships: document.relationships.filter(
          (candidate) => candidate.id !== this.relationshipId,
        ),
      },
      inverse: new CreateRelationshipCommand(
        relationship,
        document.relationships.findIndex(
          (candidate) => candidate.id === this.relationshipId,
        ),
      ),
      affectedIds: [
        this.relationshipId,
        relationship.sourceRef,
        relationship.targetRef,
      ],
      result: true,
    };
  }
}
