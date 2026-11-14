import type { ComponentProps } from 'react';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { cn } from './utils';

/**
 * Workspace primitives around `react-resizable-panels`.
 *
 * The studio is a split-view, not a grid: every region can be dragged, collapsed
 * and reopened, and the sizes survive an app restart through `autoSaveId`. These
 * wrappers only add the Evidence chrome — the resize and persistence behaviour
 * stays in the library.
 */
export const ResizablePanelGroup = ({
  className,
  ...props
}: ComponentProps<typeof PanelGroup>) => (
  <PanelGroup
    className={cn(
      'flex h-full w-full',
      'data-[panel-group-direction=vertical]:flex-col',
      className,
    )}
    {...props}
  />
);

export const ResizablePanel = Panel;

export interface ResizableHandleProps
  extends ComponentProps<typeof PanelResizeHandle> {
  /** Draws the grip in the middle of the gutter. */
  withHandle?: boolean;
}

/**
 * The drag gutter between two panels.
 *
 * It is a rail rather than a line so the pointer target stays usable at a 3px
 * visual width, and it highlights on hover to advertise that the split moves.
 */
export const ResizableHandle = ({
  withHandle = false,
  className,
  ...props
}: ResizableHandleProps) => (
  <PanelResizeHandle
    className={cn(
      'group relative flex shrink-0 items-center justify-center bg-evidence-line transition-colors',
      'hover:bg-evidence-accent/40 data-[resize-handle-state=drag]:bg-evidence-accent',
      'data-[panel-group-direction=horizontal]:w-[3px] data-[panel-group-direction=horizontal]:cursor-col-resize',
      'data-[panel-group-direction=vertical]:h-[3px] data-[panel-group-direction=vertical]:cursor-row-resize',
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <span
        aria-hidden="true"
        className={cn(
          'z-10 flex items-center justify-center rounded-xs border border-evidence-line bg-white shadow-xs',
          'opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:opacity-100',
          'group-data-[panel-group-direction=horizontal]:h-6 group-data-[panel-group-direction=horizontal]:w-[5px]',
          'group-data-[panel-group-direction=vertical]:h-[5px] group-data-[panel-group-direction=vertical]:w-6',
        )}
      />
    ) : null}
  </PanelResizeHandle>
);
