import { Badge, Button, Kbd, cn } from '@evidence-poc/desktop-ui-kit';

import { version } from '../../../../package.json';
import { AiModelStatusPill } from '../settings/AiModelStatusPill';

interface DashboardNavbarProps {
  openDisabled: boolean;
  createDisabled: boolean;
  onOpen: () => void;
  onCreate: () => void;
}

export const DashboardNavbar = ({
  openDisabled,
  createDisabled,
  onOpen,
  onCreate,
}: DashboardNavbarProps) => {
  const isMac = navigator.userAgent.includes('Macintosh');

  return (
    <header
      className={cn(
        'evidence-drag-region flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-workbench-border bg-evidence-panel px-8 py-2',
        isMac && 'pl-[max(2rem,var(--evidence-traffic-light-space))]',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-md bg-evidence-accent text-sm text-white"
        >
          ❖
        </span>
        <span className="text-sm font-bold text-evidence-ink">
          Evidence Studio
        </span>
        <Badge className="rounded-xl border-workbench-border bg-workbench-subtle px-2 py-0.5 text-[11px] font-normal text-workbench-label">
          v{version} · Fulfillment Modeling
        </Badge>
      </div>
      <div className="evidence-no-drag flex flex-wrap items-center gap-2.5">
        <AiModelStatusPill compact />
        <Button
          aria-keyshortcuts={isMac ? 'Meta+O' : 'Control+O'}
          className="rounded-md border-workbench-border px-3 text-xs font-medium hover:bg-workbench-background"
          disabled={openDisabled}
          onClick={onOpen}
          size="md"
          type="button"
        >
          打开本地项目
          <Kbd
            aria-hidden="true"
            className="h-auto min-w-0 border-0 bg-transparent p-0 font-normal text-workbench-muted"
          >
            {isMac ? '⌘O' : 'Ctrl+O'}
          </Kbd>
        </Button>
        <Button
          className="rounded-md px-3.5 text-xs font-medium"
          disabled={createDisabled}
          onClick={onCreate}
          size="md"
          type="button"
          variant="default"
        >
          <span aria-hidden="true">+</span> 新建业务模型
        </Button>
      </div>
    </header>
  );
};
