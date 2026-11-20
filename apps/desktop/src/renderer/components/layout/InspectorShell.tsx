import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@evidence-poc/desktop-ui-kit';

interface InspectorShellProps {
  collapsed: boolean;
  onReturnToCanvas: () => void;
  returnOnEscape?: boolean;
  children: ReactNode;
}

export const InspectorShell = ({
  collapsed,
  onReturnToCanvas,
  returnOnEscape = true,
  children,
}: InspectorShellProps) => {
  return (
    <section
      aria-label="实体属性检查"
      inert={collapsed}
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
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
      <header
        data-workbench-chrome=""
        className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-workbench-border bg-workbench-background px-3"
      >
        <h2 className="truncate text-xs font-semibold">实体属性检查</h2>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="返回画布"
          title={returnOnEscape ? '返回画布（Esc）' : '返回画布'}
          onClick={onReturnToCanvas}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
};
