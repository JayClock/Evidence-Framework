/** Stable machine-readable failure reasons for rejected commands. */
export type MutationErrorCode =
  | 'id.invalid'
  | 'id.duplicate'
  | 'entity.notFound'
  | 'entity.immutableField'
  | 'entity.referenced'
  | 'attribute.notFound'
  | 'attribute.duplicate'
  | 'attribute.time.missing'
  | 'context.notFound'
  | 'context.notDomain'
  | 'context.notContract'
  | 'context.responsibility'
  | 'context.rootNotAllowed'
  | 'context.rootMissing'
  | 'role.notParty'
  | 'role.notBound'
  | 'participant.contextRef'
  | 'relationship.notFound'
  | 'relationship.endpoint'
  | 'relationship.flowKind'
  | 'relationship.self'
  | 'rule.notFound'
  | 'rule.duplicate'
  | 'rule.referenced'
  | 'rule.context'
  | 'derivation.alreadyBound';

export class ModelMutationError extends Error {
  readonly code: MutationErrorCode;
  readonly details: readonly string[];

  constructor(
    code: MutationErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ModelMutationError';
    this.code = code;
    this.details = details;
  }
}
