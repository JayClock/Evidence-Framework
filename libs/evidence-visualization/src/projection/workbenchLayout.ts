import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import {
  EMPTY_GRAPH_LAYOUT,
  computeGraphLayout,
  toSerializableLayout,
  type SerializableGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';

/**
 * The canvas placement of a model, in the shape a page can carry.
 *
 * The layout is computed here, in the process that reads the sources, from the
 * same `DomainModelDocument` and the same `computeGraphLayout` the desktop canvas
 * uses. A page that re-derived its own placement would draw a second opinion
 * about the model it is describing.
 *
 * Nothing here touches the filesystem or the DOM: the layout library is plain
 * arithmetic over the document, so it runs unchanged in a generator.
 */
export const workbenchLayoutOf = async (
  document: DomainModelDocument,
): Promise<SerializableGraphLayout> => {
  if (document.entities.length === 0) {
    return EMPTY_GRAPH_LAYOUT;
  }

  return toSerializableLayout(
    await computeGraphLayout(createDomainGraph(document)),
  );
};

export type { SerializableGraphLayout };
