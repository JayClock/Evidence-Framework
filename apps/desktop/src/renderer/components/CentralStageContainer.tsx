import type { ReactNode } from 'react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@evidence-poc/desktop-ui-kit';
import type { WorkspaceViewMode } from '../state/useWorkspaceViewMode';

export interface CentralStageContainerProps {
  mode: WorkspaceViewMode;
  /** The topological canvas, mounted by the caller. */
  graph: ReactNode;
  /** The high-density ledger, mounted by the caller. */
  table: ReactNode;
}

/**
 * The centre of the studio, with one surface or two.
 *
 * The graph answers "how does this business hold together"; the ledger answers
 * "which field still owes a value". They are two projections of the same model,
 * so the container only decides what occupies the width — it never owns model
 * state, and switching surfaces costs no document edit or undo step.
 */
export const CentralStageContainer = ({
  mode,
  graph,
  table,
}: CentralStageContainerProps) => (
  <main
    data-region="central-stage"
    data-mode={mode}
    className="flex h-full min-h-0 min-w-0 flex-1"
  >
    {mode === 'graph' ? (
      <div className="h-full w-full">{graph}</div>
    ) : mode === 'table' ? (
      <div className="h-full w-full">{table}</div>
    ) : (
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="evidence-stage-split-v1"
      >
        <ResizablePanel id="split-graph" order={1} defaultSize={50} minSize={20}>
          <div className="h-full w-full">{graph}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="split-table" order={2} defaultSize={50} minSize={20}>
          <div className="h-full w-full">{table}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    )}
  </main>
);
