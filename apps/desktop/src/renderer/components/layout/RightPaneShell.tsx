import type { ReactNode } from 'react';

import { Button } from '@evidence-poc/desktop-ui-kit';

import type { RightPane } from '../../state/useWorkspaceLayoutState';

interface RightPaneShellProps {
  pane: RightPane;
  collapsed: boolean;
  onShowInspector: () => void;
  onShowCopilot: () => void;
  children: ReactNode;
}

export const RightPaneShell = ({
  pane,
  collapsed,
  onShowInspector,
  onShowCopilot,
  children,
}: RightPaneShellProps) => {
  const switchClass =
    'min-w-0 flex-1 rounded-md text-workbench-muted aria-pressed:bg-workbench-subtle aria-pressed:font-medium aria-pressed:text-evidence-ink';

  return (
    <section
      aria-label="检查与协同"
      inert={collapsed}
      className="flex h-full min-h-0 flex-col bg-white"
    >
      <div
        role="group"
        aria-label="右侧面板"
        data-workbench-chrome=""
        className="flex h-10 shrink-0 items-center gap-1 border-b border-workbench-border px-2"
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
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
};
