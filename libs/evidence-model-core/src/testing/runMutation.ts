import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createModelSession } from '../session/createModelSession.js';
import type { ModelRecipe } from '../session/types.js';

/** Test a draft recipe through the real transaction/history boundary. */
export const runMutation = <T>(
  document: DomainModelDocument,
  recipe: ModelRecipe<T>,
) => {
  const session = createModelSession({ document });
  let affectedIds: readonly string[] = [];
  session.subscribe((event) => {
    if (event.type === 'document-changed') affectedIds = event.affectedIds;
  });
  const result = session.mutate(recipe);
  return {
    document: session.getDocument(),
    result,
    affectedIds,
    undo: () => {
      session.undo();
      return session.getDocument();
    },
  };
};
