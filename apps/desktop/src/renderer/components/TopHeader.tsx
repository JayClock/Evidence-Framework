import { useMemo } from 'react';

import { Search } from 'lucide-react';

import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { ModelSelection } from '@evidence-poc/evidence-model-core';
import { ENTITY_CATEGORY_LABELS } from '@evidence-poc/evidence-schema';
import {
  Button,
  cn,
  KbdChord,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@evidence-poc/desktop-ui-kit';

import { AiModelStatusPill } from './settings/AiModelStatusPill';
import { McpStatusPill } from './McpStatusPill';

interface TopHeaderProps {
  projectName: string;
  dirty: boolean;
  graph: DomainGraph;
  selection: ModelSelection;
  onSave: () => void;
  /** Opens the command hub for editor actions and navigation. */
  onOpenCommandPalette: () => void;
  ledgerExport?: { enabled: boolean; onExport: () => void } | undefined;
  storyHeader?: { title: string; onExit: () => void } | undefined;
}

/**
 * The window's title row.
 *
 * Shows the project, selection breadcrumb and document state alongside save,
 * MCP status and the command hub. Search, history, delivery and other editor
 * actions are available through the command hub rather than separate buttons.
 */
export const TopHeader = ({
  projectName,
  dirty,
  graph,
  selection,
  onSave,
  onOpenCommandPalette,
  ledgerExport,
  storyHeader,
}: TopHeaderProps) => {
  const ledgerActive = ledgerExport !== undefined;
  const storyTitle = storyHeader?.title;
  const breadcrumb = useMemo(() => {
    if (storyTitle !== undefined) return { trail: [], name: storyTitle };
    if (ledgerActive) {
      return { trail: [], name: '领域总台账 (Domain Model Ledger)' };
    }
    const nodeId = selection.nodeId;

    if (nodeId === null) {
      return null;
    }

    const entity = graph.getEntity(nodeId);

    if (entity === undefined) {
      return null;
    }

    const contextRef = 'contextRef' in entity ? entity.contextRef : undefined;
    const path = contextRef === undefined ? [] : graph.contextPath(contextRef);

    return {
      trail: path.map((context) => context.label),
      name: `${entity.label} (${ENTITY_CATEGORY_LABELS[entity.category]})`,
    };
  }, [graph, ledgerActive, selection.nodeId, storyTitle]);

  return (
    <header
      data-workbench-chrome=""
      aria-label="工作台顶栏"
      className="evidence-drag-region flex h-12 shrink-0 items-center justify-between gap-3 border-b border-workbench-border bg-white pr-4 pl-[var(--evidence-traffic-light-space)]"
    >
      <div className="evidence-no-drag flex min-w-0 items-center gap-1 text-xs">
        <span
          className="truncate font-semibold text-evidence-ink"
          title={projectName}
        >
          {projectName}
        </span>
        {dirty ? (
          <span
            className="shrink-0 text-evidence-evidence"
            title="有未保存修改"
          >
            *
          </span>
        ) : null}
        {breadcrumb !== null ? (
          <span
            className="flex min-w-0 items-center gap-1 text-workbench-muted"
            title={[...breadcrumb.trail, breadcrumb.name].join(' / ')}
          >
            <span aria-hidden="true" className="text-workbench-border-strong">
              /
            </span>
            {breadcrumb.trail.map((label, index) => (
              <span key={`${label}-${index}`} className="truncate">
                {label} /
              </span>
            ))}
            <span className="truncate">{breadcrumb.name}</span>
          </span>
        ) : null}
      </div>

      {ledgerExport !== undefined ? (
        <Button
          type="button"
          variant="outline"
          className="evidence-no-drag rounded-md border-workbench-border px-2.5"
          disabled={!ledgerExport.enabled}
          onClick={ledgerExport.onExport}
        >
          导出 CSV
        </Button>
      ) : null}
      {storyHeader ? (
        <Button
          className="evidence-no-drag"
          onClick={storyHeader.onExit}
          aria-keyshortcuts="Escape"
        >
          退出放映 <kbd aria-hidden="true">Esc</kbd>
        </Button>
      ) : null}
      <div
        hidden={ledgerActive || storyHeader !== undefined}
        className={cn(
          'evidence-no-drag shrink-0 items-center gap-2',
          !ledgerActive && !storyHeader && 'flex',
        )}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                onClick={onOpenCommandPalette}
                aria-label="打开快速命令"
                className="rounded-md border-workbench-border bg-workbench-background pr-1.5 text-workbench-muted"
              >
                <Search aria-hidden="true" className="size-3.5" />
                <span>快速命令</span>
                <KbdChord chord="⌘+K" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">搜索命令与业务对象</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <AiModelStatusPill />
        <McpStatusPill />

        <Button
          variant="default"
          className="rounded-md px-3 text-xs font-medium"
          onClick={onSave}
          title="保存到磁盘（Cmd/Ctrl+S）"
        >
          保存模型
        </Button>
      </div>
    </header>
  );
};
