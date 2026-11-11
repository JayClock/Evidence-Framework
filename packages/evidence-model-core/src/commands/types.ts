import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Stable machine-readable failure reasons for rejected commands. */
export type CommandErrorCode =
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
  | 'relationship.self'
  | 'rule.notFound'
  | 'rule.duplicate'
  | 'rule.referenced'
  | 'rule.context'
  | 'derivation.alreadyBound'
  | 'sequence.mismatch';

export class ModelCommandError extends Error {
  readonly code: CommandErrorCode;
  readonly details: readonly string[];

  constructor(
    code: CommandErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ModelCommandError';
    this.code = code;
    this.details = details;
  }
}

/** Result of applying one command to an immutable document. */
export interface ModelCommandOutcome<TResult> {
  document: DomainModelDocument;
  /** Command that restores the previous document when applied. */
  inverse: ModelCommand<unknown>;
  /** Object ids the renderer has to refresh. */
  affectedIds: readonly string[];
  result: TResult;
}

/**
 * A deterministic document transition.
 *
 * Commands never mutate their input: they return a new document plus the
 * command that undoes them, which is what the session history stores.
 */
export interface ModelCommand<TResult = void> {
  readonly type: string;
  apply(document: DomainModelDocument): ModelCommandOutcome<TResult>;
}
