import ELKBundle from 'elkjs/lib/elk.bundled.js';
import type { ELK } from 'elkjs';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import { transformDomainGraphToElk } from '../adapter/domainToElk.js';
import { extractElkResultToLayout } from '../adapter/elkToLayout.js';
import { computeSwimlaneLayout } from './swimlaneLayout.js';
import type {
  CanvasLayoutMode,
  CanvasViewMode,
  DomainGraphLayout,
} from '../layout/types.js';

// The bundled implementation uses its in-process worker in both Node and Vite;
// no worker URL, DOM, network request or native executable is needed.
// elkjs ships a CommonJS constructor with ESM-style declarations. NodeNext
// interprets its default as a namespace, unlike Vite; normalize the type only.
const ElkConstructor = ELKBundle as unknown as new () => ELK;
const elk = new ElkConstructor();

export interface ComputeLayoutOptions {
  viewMode?: CanvasViewMode;
  layoutMode?: CanvasLayoutMode;
}

export const computeGraphLayout = async (
  graph: DomainGraph,
  options: ComputeLayoutOptions = {},
): Promise<DomainGraphLayout> => {
  if (options.layoutMode === 'swimlane')
    return computeSwimlaneLayout(graph, options.viewMode);
  const input = transformDomainGraphToElk(graph, options.viewMode);
  // ELK adds padding even to an empty root; an empty drawing has no extent.
  const result = input.children?.length ? await elk.layout(input) : input;
  return extractElkResultToLayout(result, graph);
};
