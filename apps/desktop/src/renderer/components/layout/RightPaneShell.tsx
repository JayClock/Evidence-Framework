import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@evidence-poc/desktop-ui-kit';

import type { RightPane } from '../../state/useWorkspaceLayoutState';

interface RightPaneShellProps {
  pane: RightPane;
  collapsed: boolean;
  onShowInspector: () => void;
  onShowCopilot: () => void;
  onReturnToCanvas?: () => void;
  returnOnEscape?: boolean;
  children: ReactNode;
}

export const RightPaneShell = ({
  pane,
  collapsed,
  onShowInspector,
  onShowCopilot,
  onReturnToCanvas,
  returnOnEscape = true,
  children,
}: RightPaneShellProps) => {
  const switchClass =
    'min-w-0 flex-1 rounded-md text-workbench-muted aria-pressed:bg-workbench-subtle aria-pressed:font-medium aria-pressed:text-evidence-ink';

  return (
    <section
      aria-label="检查与协同"
      inert={collapsed}
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          !onReturnToCanvas ||
          !returnOnEscape ||
          (event.target instanceof Element &&
            event.target.closest(
              'input, textarea, select, [contenteditable="true"], [role="dialog"]',
            ))
        )
          return;
        event.preventDefault();
        onReturnToCanvas();
      }}
      className="flex h-full min-h-0 flex-col bg-white"
    >
      <div
        role="group"
        aria-label="右侧面板"
        data-workbench-chrome=""
        className="flex h-11 shrink-0 items-center gap-1 border-b border-workbench-border bg-[#fafafa] px-3"
      >
        <Button
          type="button"
          variant="ghost"
          aria-pressed={pane === 'inspector'}
          className={switchClass}
          onClick={onShowInspector}
        >
          <span className="truncate">实体属性检查</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={pane === 'copilot'}
          className={switchClass}
          onClick={onShowCopilot}
        >
          <span className="truncate">AI Copilot</span>
        </Button>
        {onReturnToCanvas === undefined ? null : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="[&_svg]:size-3.5"
            aria-label="返回画布"
            title={returnOnEscape ? '返回画布（Esc）' : '返回画布'}
            onClick={onReturnToCanvas}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
};
