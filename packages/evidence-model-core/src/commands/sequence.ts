import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type { ModelCommand, ModelCommandOutcome } from './types.js';

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * Applies commands in order as one atomic transaction.
 *
 * The inverse is the reversed sequence of the individual inverses, so undo of a
 * composite edit (request + confirmation + rule) restores the exact previous
 * document in one history step.
 */
export class CommandSequence implements ModelCommand<readonly unknown[]> {
  readonly type: string;

  constructor(
    private readonly commands: readonly ModelCommand<unknown>[],
    label?: string,
  ) {
    this.type = label ?? 'sequence';
  }

  apply(
    document: DomainModelDocument,
  ): ModelCommandOutcome<readonly unknown[]> {
    const inverses: ModelCommand<unknown>[] = [];
    const results: unknown[] = [];
    const affected = new Set<string>();
    let current = document;

    for (const command of this.commands) {
      const outcome = command.apply(current);
      current = outcome.document;
      inverses.push(outcome.inverse);
      results.push(outcome.result);

      for (const id of outcome.affectedIds) {
        affected.add(id);
      }
    }

    return {
      document: current,
      inverse: new CommandSequence([...inverses].reverse()),
      affectedIds: unique([...affected]),
      result: results,
    };
  }
}

/** Reverses a list of commands into one undo step. */
export const sequenceInverse = (
  commands: readonly ModelCommand<unknown>[],
): ModelCommand<unknown> =>
  new CommandSequence([...commands].reverse(), 'sequence-inverse');

/** Replaces the whole document; used by cascade deletes and reloads. */
export class ReplaceDocumentCommand
  implements ModelCommand<DomainModelDocument>
{
  readonly type = 'replace-document';

  constructor(private readonly next: DomainModelDocument) {}

  apply(
    document: DomainModelDocument,
  ): ModelCommandOutcome<DomainModelDocument> {
    return {
      document: this.next,
      inverse: new ReplaceDocumentCommand(document),
      affectedIds: unique([
        ...document.entities.map((entity) => entity.id),
        ...this.next.entities.map((entity) => entity.id),
      ]),
      result: this.next,
    };
  }
}
