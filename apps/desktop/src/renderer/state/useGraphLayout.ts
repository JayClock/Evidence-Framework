import { useEffect, useState } from 'react';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeGraphLayout,
  EMPTY_GRAPH_LAYOUT,
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
) => {
  const [result, setResult] = useState<{
    graph: DomainGraph;
    viewMode: CanvasViewMode;
    layout: DomainGraphLayout;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void computeGraphLayout(graph, { viewMode }).then(
      (layout) => {
        if (!cancelled) setResult({ graph, viewMode, layout, error: null });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({
            graph,
            viewMode,
            layout: EMPTY_LAYOUT,
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [graph, viewMode]);
  const current =
    result?.graph === graph && result.viewMode === viewMode ? result : null;
  return {
    layout: current?.layout ?? EMPTY_LAYOUT,
    layoutPending: current === null,
    layoutError: current?.error ?? null,
  };
};
