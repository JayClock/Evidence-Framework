import { useCallback, useState } from 'react';

import type { WorkspaceViewMode } from '@evidence-poc/desktop-ui-kit';

/** The four ways one model can be read beside the graph. */
export const SPLIT_PANES = [
  'ledger',
  'openapi',
  'cel',
  'simulation',
] as const;

export type SplitPaneMode = (typeof SPLIT_PANES)[number];

export const SPLIT_PANE_LABELS: Record<SplitPaneMode, string> = {
  ledger: '关键台账',
  openapi: '交付契约',
  cel: '派生规则',
  simulation: '仿真沙箱',
};

export type SplitDirection = 'horizontal' | 'vertical';

export interface WorkspaceSplitState {
  /** True while the secondary stage shares the width with the canvas. */
  readonly isSplit: boolean;
  /** Which projection currently fills the secondary stage. */
  readonly activePane: SplitPaneMode;
  /** Left/right, or top/bottom. */
  readonly splitDirection: SplitDirection;
  /** Share of the workspace the secondary stage takes, 0–100. */
  readonly splitSize: number;
}

export interface WorkspaceSplitActions {
  /** Opens the stage on a pane, even when it is already open elsewhere. */
  openSplit: (pane: SplitPaneMode) => void;
  closeSplit: () => void;
  toggleSplit: (pane?: SplitPaneMode) => void;
  setActivePane: (pane: SplitPaneMode) => void;
  setSplitDirection: (direction: SplitDirection) => void;
  rotateSplitDirection: () => void;
  setSplitSize: (size: number) => void;
}

export type WorkspaceSplitController = WorkspaceSplitState &
  WorkspaceSplitActions;

export const DEFAULT_SPLIT_SIZE = 50;

/**
 * The secondary stage's state bus.
 *
 * Whether the stage is open is *not* a second boolean: it is one more value of
 * the view mode the segmented control already owns. Two flags would let the
 * control say "拓扑图" while a split column is on screen, which is the class of
 * bug the phase-2 workspace object was introduced to end.
 *
 * Only the *pane* is new, because the stage's contents are the one thing the
 * view mode cannot describe: "分屏" says a second surface exists, not which.
 */
export const useWorkspaceSplitState = (
  mode: WorkspaceViewMode,
  setMode: (mode: WorkspaceViewMode) => void,
  initialPane: SplitPaneMode = 'ledger',
): WorkspaceSplitController => {
  const [activePane, setActivePane] = useState<SplitPaneMode>(initialPane);
  const [splitDirection, setSplitDirection] =
    useState<SplitDirection>('horizontal');
  const [splitSize, setSplitSize] = useState(DEFAULT_SPLIT_SIZE);

  const isSplit = mode === 'split';

  const openSplit = useCallback(
    (pane: SplitPaneMode) => {
      setActivePane(pane);
      setMode('split');
    },
    [setMode],
  );

  const closeSplit = useCallback(() => {
    setMode('graph');
  }, [setMode]);

  const toggleSplit = useCallback(
    (pane?: SplitPaneMode) => {
      if (mode === 'split') {
        setMode('graph');
        return;
      }

      openSplit(pane ?? activePane);
    },
    [activePane, mode, openSplit, setMode],
  );

  const rotateSplitDirection = useCallback(() => {
    setSplitDirection((current) =>
      current === 'horizontal' ? 'vertical' : 'horizontal',
    );
  }, []);

  return {
    isSplit,
    activePane,
    splitDirection,
    splitSize,
    openSplit,
    closeSplit,
    toggleSplit,
    setActivePane,
    setSplitDirection,
    rotateSplitDirection,
    setSplitSize,
  };
};
