import { useEffect, useState } from 'react';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeGraphLayout,
  EMPTY_GRAPH_LAYOUT,
  type CanvasLayoutMode,
  type CanvasViewMode,
  type DomainGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';

const EMPTY_LAYOUT: DomainGraphLayout = {
  ...EMPTY_GRAPH_LAYOUT,
  nodes: [],
  contextGroups: [],
  nodeById: new Map(),
  contextGroupById: new Map(),
  edgeById: new Map(),
};

/** Only publish geometry belonging to the current document and density. */
export const useGraphLayout = (
  graph: DomainGraph,
  viewMode: CanvasViewMode,
  layoutMode: CanvasLayoutMode = 'topology',
) => {
  const [result, setResult] = useState<{
    graph: DomainGraph;
    viewMode: CanvasViewMode;
    layoutMode: CanvasLayoutMode;
    layout: DomainGraphLayout;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void computeGraphLayout(graph, { viewMode, layoutMode }).then(
      (layout) => {
        if (!cancelled)
          setResult({ graph, viewMode, layoutMode, layout, error: null });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({
            graph,
            viewMode,
            layoutMode,
            layout: EMPTY_LAYOUT,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [graph, viewMode, layoutMode]);
  const current =
    result?.graph === graph &&
    result.viewMode === viewMode &&
    result.layoutMode === layoutMode
      ? result
      : null;
  return {
    layout: current?.layout ?? EMPTY_LAYOUT,
    layoutPending: current === null,
    layoutError: current?.error ?? null,
  };
};
