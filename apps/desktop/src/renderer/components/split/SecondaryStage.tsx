import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  ArrowLeftRight,
  Columns2,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';

import { cn } from '@evidence-poc/desktop-ui-kit';

import {
  SPLIT_PANES,
  SPLIT_PANE_LABELS,
  type SplitDirection,
  type SplitPaneMode,
} from '../../state/useWorkspaceSplitState';

export interface SecondaryStageProps {
  activePane: SplitPaneMode;
  onPaneChange: (pane: SplitPaneMode) => void;
  onRotateDirection: () => void;
  onClose: () => void;
  direction: SplitDirection;
  /** One renderer per pane; the inactive ones are not mounted. */
  panes: Readonly<Record<SplitPaneMode, ReactNode>>;
  /** Counts printed on a tab when the pane has something to report. */
  badges?: Partial<Record<SplitPaneMode, number>>;
}

/**
 * The second half of a split workspace.
 *
 * It is one container with a rail, not four panels: the stage's identity — "what
 * am I comparing the graph against right now" — is the selected tab, and the
 * tooling around it (rotate, maximise, close) applies to whichever projection is
 * there. Maximising lifts the pane over the canvas without closing the split, so
 * a contract can be read full width and then be put back beside the topology.
 */
export const SecondaryStage = ({
  activePane,
  onPaneChange,
  onRotateDirection,
  onClose,
  direction,
  panes,
  badges = {},
}: SecondaryStageProps) => {
  const [maximized, setMaximized] = useState(false);

  return (
    <section
      aria-label="副视口"
      data-region="secondary-stage"
      data-pane={activePane}
      data-direction={direction}
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col bg-white',
        maximized
          ? 'fixed inset-0 z-30 shadow-overlay'
          : 'border-l border-evidence-line',
      )}
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-evidence-line bg-evidence-surface/70 px-1.5">
        <div
          role="tablist"
          aria-label="副视口视图"
          className="flex min-w-0 items-center gap-0.5"
        >
          {SPLIT_PANES.map((pane) => {
            const badge = badges[pane] ?? 0;
            const selected = pane === activePane;

            return (
              <button
                key={pane}
                type="button"
                role="tab"
                id={`secondary-tab-${pane}`}
                aria-selected={selected}
                aria-controls={`secondary-panel-${pane}`}
                onClick={() => onPaneChange(pane)}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors',
                  selected
                    ? 'bg-white font-medium text-evidence-ink shadow-xs'
                    : 'text-evidence-muted hover:text-evidence-ink',
                )}
              >
                {SPLIT_PANE_LABELS[pane]}
                {badge > 0 ? (
                  <span className="rounded-full bg-evidence-accent/12 px-1 text-[9px] text-evidence-accent tabular-nums">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onRotateDirection}
            aria-label="切换分屏方向"
            title="切换分屏方向（⌥S）"
            className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
          >
            {direction === 'horizontal' ? (
              <ArrowLeftRight aria-hidden="true" className="size-3.5" />
            ) : (
              <Columns2 aria-hidden="true" className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMaximized((current) => !current)}
            aria-label={maximized ? '还原分屏' : '最大化副屏'}
            aria-pressed={maximized}
            title={maximized ? '还原分屏' : '最大化副屏'}
            className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
          >
            {maximized ? (
              <Minimize2 aria-hidden="true" className="size-3.5" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setMaximized(false);
              onClose();
            }}
            aria-label="关闭分屏"
            title="关闭分屏（Esc）"
            className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`secondary-panel-${activePane}`}
        aria-labelledby={`secondary-tab-${activePane}`}
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {panes[activePane]}
      </div>
    </section>
  );
};
