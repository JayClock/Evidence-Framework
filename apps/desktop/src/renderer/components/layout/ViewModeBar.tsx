import type { ReactNode } from 'react';
import { Clapperboard, Compass, Network } from 'lucide-react';

import { Button } from '@evidence-poc/desktop-ui-kit';

import type { WorkspaceViewMode } from '../../state/useWorkspaceViewMode';

interface ViewModeBarProps {
  mode: WorkspaceViewMode;
  onChange: (mode: 'journey' | 'topology' | 'story') => void;
  storyControls?: ReactNode;
}

/** The HUD controls the canvas; the view bar switches workspace modes. */
export const ViewModeBar = ({
  mode,
  onChange,
  storyControls,
}: ViewModeBarProps) => {
  const ledgerChord = navigator.userAgent.includes('Macintosh')
    ? '⌘1'
    : 'Ctrl+1';
  const segmentClass =
    'rounded-sm px-2.5 text-workbench-muted aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-evidence-ink aria-pressed:shadow-xs';

  return (
    <div
      data-canvas-control=""
      data-evidence-capture-hide=""
      data-story-toolbar=""
      data-workbench-chrome=""
      className="flex min-h-[38px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-workbench-border bg-white px-4 py-1"
    >
      <div
        role="group"
        aria-label="画布放映模式"
        className="flex shrink-0 items-center rounded-md bg-workbench-subtle p-0.5"
      >
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={segmentClass}
          aria-pressed={mode === 'journey'}
          onClick={() => onChange('journey')}
        >
          <Compass aria-hidden="true" className="size-3.5" />
          业务旅程
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={segmentClass}
          aria-pressed={mode === 'topology'}
          onClick={() => onChange('topology')}
        >
          <Network aria-hidden="true" className="size-3.5" />
          拓扑图
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={segmentClass}
          aria-pressed={mode === 'story'}
          onClick={() => onChange('story')}
        >
          <Clapperboard aria-hidden="true" className="size-3.5" />
          业务流放映
        </Button>
      </div>
      {mode === 'story' ? (
        storyControls
      ) : (
        <p className="ml-auto text-[11px] text-workbench-muted">
          <kbd>Alt+1</kbd> 旅程 / <kbd>Alt+2</kbd> 拓扑全景 /{' '}
          <kbd>{ledgerChord}</kbd> 总台账
        </p>
      )}
    </div>
  );
};
